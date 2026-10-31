# Observations

Step 1 also adds `products.py` for QR2 PSF/QR3 ePSF native-data inspection, with explicit MP_* and
MSKN/MSKM quality decoding. All five target fields have pinned real metadata/cutout reports. These
inspection helpers remain separate from discovery and are not validated registration/detection.

## Production feature

Step 2 implements discovery-v1 in coordinates/registry/provider/repository/service/router slices.
The SIA adapter validates named columns, units, status, identity and trusted links with hard row/byte
caps. Native and HTTPS repositories persist immutable products/snapshots; pagination is frozen,
TTL revalidation creates new snapshots and exposure+detector dedup retains alternate product IDs.
Legacy radius search returns 410. Full contract/reproduction: [discovery](../../../../docs/discovery.md).
Local wavelength, image acquisition/registration and viewer workers remain later steps.

## Milestone-one implementation

`feasibility.py` is an offline QR2 cutout inspector: required HDUs/units/UTC, quality masks,
local WCS-WAVE lookup and PSF reference selection. It powers the pinned real-data research
packet in `docs/research/`; it is not a production SIA discovery adapter or an enabled API.
