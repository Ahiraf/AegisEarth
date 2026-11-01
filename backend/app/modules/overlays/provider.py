"""Fixed IRSA endpoints, bounded bodies/rows and no caller-controlled URLs or ADQL."""

import csv
import io
import re

import httpx

TAP = "https://irsa.ipac.caltech.edu/TAP/sync"
IBE = "https://irsa.ipac.caltech.edu/ibe"
GAIA_COLUMNS = "source_id,ra,dec,ref_epoch,pmra,pmdec,parallax,ra_error,dec_error,pmra_error,pmdec_error,phot_g_mean_mag,ruwe"
WISE_COLUMNS = "designation,ra,dec,sigra,sigdec,w1mpro,w1sigmpro,w2mpro,w2sigmpro,cc_flags,ph_qual,ext_flg,w1mjdmin,w1mjdmax,w1mjdmean,w2mjdmin,w2mjdmax,w2mjdmean"


class OverlayUnavailable(Exception):
    pass


class ContextProvider:
    def __init__(self, settings, *, transport=None):
        self.settings, self.transport = settings, transport

    def fetch(self, url, params, maximum=2_000_000):
        try:
            with (
                httpx.Client(
                    timeout=min(30, self.settings.provider_timeout_seconds),
                    follow_redirects=False,
                    transport=self.transport,
                    headers={"User-Agent": self.settings.provider_user_agent},
                ) as client,
                client.stream("GET", url, params=params) as response,
            ):
                if response.status_code != 200:
                    raise OverlayUnavailable("provider_http_error")
                data = bytearray()
                for chunk in response.iter_bytes():
                    data.extend(chunk)
                    if len(data) > maximum:
                        raise OverlayUnavailable("provider_byte_limit")
                return bytes(data)
        except httpx.HTTPError as exc:
            raise OverlayUnavailable("provider_unavailable") from exc

    def catalog(self, survey, ra, dec, radius, limit):
        columns, table = (
            (GAIA_COLUMNS, "gaia_dr3_source")
            if survey == "gaia"
            else (WISE_COLUMNS, "allwise_p3as_psd")
        )
        query = (
            f"SELECT TOP {int(limit) + 1} {columns},"
            f"DISTANCE(POINT('ICRS',ra,dec),POINT('ICRS',{ra:.12f},{dec:.12f})) AS catalog_distance_arcsec "
            f"FROM {table} WHERE "
            f"CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',{ra:.12f},{dec:.12f},{radius:.12f}))=1 "
            "ORDER BY catalog_distance_arcsec"
        )
        body = self.fetch(
            TAP, {"QUERY": query, "REQUEST": "doQuery", "LANG": "ADQL", "FORMAT": "csv"}
        )
        rows = list(csv.DictReader(io.StringIO(body.decode("utf-8"))))
        if not rows and not body.startswith(columns.split(",")[0].encode()):
            raise OverlayUnavailable("provider_schema_changed")
        if rows and not set(columns.split(",")) <= rows[0].keys():
            raise OverlayUnavailable("provider_schema_changed")
        return rows[:limit], len(rows) > limit, body

    def wise_image(self, ra, dec, band, size_arcmin):
        body = self.fetch(
            IBE + "/search/wise/allwise/p3am_cdd",
            {"POS": f"{ra:.12f},{dec:.12f}", "mcen": "", "ct": "csv"},
        )
        rows = list(csv.DictReader(io.StringIO(body.decode("utf-8"))))
        selected = [r for r in rows if r.get("band") == str(band)]
        if not selected:
            raise OverlayUnavailable("no_wise_image_coverage")
        row = min(selected, key=lambda r: r["coadd_id"])
        identifier = row["coadd_id"]
        if not re.fullmatch(r"\d{4}[pm]\d{3}_ac51", identifier):
            raise OverlayUnavailable("provider_schema_changed")
        url = f"{IBE}/data/wise/allwise/p3am_cdd/{identifier[:2]}/{identifier[:4]}/{identifier}/{identifier}-w{band}-int-3.fits"
        params = {
            "center": f"{ra:.12f},{dec:.12f}",
            "size": f"{size_arcmin:.8f}arcmin",
            "gzip": "false",
        }
        data = self.fetch(url, params, maximum=16_000_000)
        if not data.startswith(b"SIMPLE  ="):
            raise OverlayUnavailable("invalid_wise_fits_response")
        return data, row, str(httpx.URL(url, params=params))
