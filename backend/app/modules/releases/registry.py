"""Known source collections for bounded research; activation is explicit and versioned."""

REGISTRY_VERSION = "irsa-2026-10-31"
COLLECTIONS = ("spherex_qr3", "spherex_qr3_deep", "spherex_qr2", "spherex_qr2_deep")
SIA_URL = "https://irsa.ipac.caltech.edu/SIA"

# New releases must opt into an adapter after schema/identity validation.
SOURCES = {
    name: {
        "collection": name,
        "release": "qr3" if "qr3" in name else "qr2",
        "survey": "deep" if name.endswith("_deep") else "wide",
        "priority": 3 if "qr3" in name else 2,
        "adapter": "irsa-sia-tabledata-v1",
        "psf_format": "epsf_table" if "qr3" in name else "psf_cube",
        "doi": "10.26131/IRSA662" if "qr3" in name else "10.26131/IRSA652",
    }
    for name in COLLECTIONS
}
