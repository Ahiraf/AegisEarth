"""Build the 102-channel R7 catalog from checksum-pinned official CSV subset captures."""

import csv
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    source = ROOT / "var/calibration"
    receipt = json.loads((source / "receipt.json").read_text(encoding="utf-8"))
    members = {r["member"]: r for r in receipt["members"]}

    def rows(member):
        record = members[member]
        body = (source / record["local_file"]).read_bytes()
        if hashlib.sha256(body).hexdigest() != record["sha256"]:
            raise ValueError("Calibration member changed")
        return list(csv.DictReader(body.decode().splitlines()))

    channels = []
    for detector in range(1, 7):
        member = (
            f"FidSpecSummary/SubChannel17/Band{detector}/FidSpecSummary_Band{detector}_SpecCh17.csv"
        )
        summary = rows(member)
        if len(summary) != 17:
            raise ValueError("Expected 17 nominal channels per detector")
        for row in summary:
            local = int(row["SpecCh"])
            result = {
                "id": (detector - 1) * 17 + local,
                "detector": f"D{detector}",
                "local_channel": local,
                "band_center_um": float(row["BandCenter_um"]),
                "band_width_um": float(row["BandWidth_um"]),
                "all_pixel_center_um": float(row["BandCenter_Allpix_um"]),
                "all_pixel_width_um": float(row["BandWidth_Allpix_um"]),
                "summary_member_sha256": members[member]["sha256"],
            }
            for folder, kind, key in (
                ("MiddlePixel", "Cent", "middle_pixel_response"),
                ("MeanAllPixel", "Allpix", "all_pixel_response"),
            ):
                name = f"{folder}/SubChannel17/Band{detector}/FiducialSpec_Band{detector}_SubCh{local:02d}_17_{kind}.csv"
                samples = rows(name)
                result[key] = {
                    "wavelength_um": [float(r["Wavelength_um"]) for r in samples],
                    "normalized_transmission": [float(r["NormTransmission"]) for r in samples],
                    "member_sha256": members[name]["sha256"],
                }
            channels.append(result)
    result = {
        "version": "ssdc-r7-202607-nominal17-v1",
        "source_url": receipt["source_url"],
        "documentation_url": "https://irsa.ipac.caltech.edu/data/SPHEREx/docs/SPHERExSpectralFiles_202607.pdf",
        "retrieved_at_utc": receipt["retrieved_at_utc"],
        "total": 102,
        "wavelength_unit": "um",
        "scope": "nominal fiducial channels, not per-pixel calibrated wavelength or observed availability",
        "notes": [
            "17 nominal channels per detector, increasing wavelength; edge channels 0/18 excluded",
            "Representative laboratory response curves; not a measured sky-pixel response",
            "Original signed normalized transmissions retained; no invented or interpolated missing channels",
            "ChannelMaps and pipeline CWAVE/CBAND are distinct calibration products",
        ],
        "channels": channels,
    }
    output = ROOT / "backend/app/modules/bands/channels.json"
    output.write_text(
        json.dumps(result, separators=(",", ":"), allow_nan=False) + "\n", encoding="utf-8"
    )
    public = ROOT / "docs/research/calibration"
    public.mkdir(parents=True, exist_ok=True)
    (public / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print("Built", len(channels), "official nominal channels;", output.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
