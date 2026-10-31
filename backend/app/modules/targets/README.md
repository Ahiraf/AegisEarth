# Targets — planned feature boundary

The five verified records, typed catalog, approximate epoch-aware search positions and read-only
GET /api/v1/targets snapshot route are implemented. POST /targets/resolve now normalizes decimal/sexagesimal user coordinates to ICRS degrees,
including RA wrapping/poles and explicit unit checks. Live name resolution remains future work. Own five
challenge presets: Barnard's Star, Epsilon Indi B, WISE 0855, RW Aurigae and R Draconis. Preserve
supplied/catalog positions, aliases, frame/reference epoch, proper motions/errors and source receipts.
Direct RA/Dec entry works independently of optional name resolution. Follow plan steps 1–2/6 and
[target validation](../../../../docs/target_validation.md); native source investigation is complete,
while public-viewer and scientific recovery tests remain pending.
