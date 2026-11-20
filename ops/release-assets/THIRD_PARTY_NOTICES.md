# Third-party notices (BusinessMRI release package)

Licences below were read from the installed package metadata on 2026-11-20. This is an engineering inventory, not legal advice.

## Bundled inside this package
| Component | Where | Licence |
|---|---|---|
| Noto Sans Regular/Bold | `backend/pdf_renderer/fonts/` (notice: `LICENSE-NotoSans-OFL-1.1.txt`) | SIL Open Font License 1.1 |
| Hunspell `mn_MN` dictionary (LibreOffice dictionaries) | `backend/resources/hunspell/` (notice: `LICENSE-mn_MN-LPPL.txt`, copyright holder named inside) | LaTeX Project Public License 1.3 (unmodified files; any modified copy must be renamed) |
| Inter variable font (`@fontsource-variable/inter` 5.3.0) | compiled into `frontend/dist/assets` | SIL Open Font License 1.1 |
| React 19.0.0, react-dom 19.0.0, qrcode-generator 2.0.4 | compiled into `frontend/dist/assets` | MIT |

## Installed on the server by the install steps (not shipped in the archive)
| Component | Licence |
|---|---|
| `@prisma/client` 6.15.0, `prisma` 6.15.0 | Apache-2.0 |
| `dotenv` 17.2.1 | BSD-2-Clause |
| `reportlab` 4.3.1 | BSD (ReportLab Inc.) |
| `pillow` 11.1.0 | MIT-CMU (HPND) |
| `chardet` 5.2.0 (dependency of reportlab) | LGPL (installed unmodified from PyPI, not redistributed here) |
| Hunspell executable | MPL/GPL/LGPL (server prerequisite, installed by the operator) |

Not covered: licences of every transitive npm package (run a licence scan before a public commercial launch if the owner's policy requires one).
