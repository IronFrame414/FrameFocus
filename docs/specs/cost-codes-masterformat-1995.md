# Cost codes — CSI MasterFormat 1995, the 16-division set

**Built 2026-10-03 for the division budgeting build (Part H of
`estimates-and-change-orders-spec.md`).** ⚠️ **Committed ahead of the feature that uses it, so the
code format is fixed before anything writes one.**

---

# ⚠️ 1 — THE FORMAT, AND THE TRAP

**A code is FIVE characters: `DDSSS`.** Two digits of division, three of section.
`02110` = Division 02 Sitework, section 110 Site Clearing.

⚠️⚠️ **STORE IT AS TEXT, ZERO-PADDED TO 5. NEVER AS A NUMBER.**

**The reason, from a real file.** Sheet2 of Josh's workbook `Leonado Beach Sails 2.xlsx` carries a
competitor's estimate ("Itasca Estimate revised") coded this way. Excel stored the codes as numbers,
so every code in Divisions 01–09 lost its leading zero: `01000` reads as `1000`, `02110` as `2110`.

⚠️ **`01000` read as the number `1000` has first two characters `10`, so General Conditions files
itself under Division 10 Specialties — silently, with no error.** That is the entire feature failing
quietly.

## The padding rule, and it is unambiguous

| what you receive | what it means | what to do |
| --- | --- | --- |
| **4 characters** (`1000`, `2110`, `9250`) | a Division **01–09** code that lost its zero | **pad to 5**: `01000`, `02110`, `09250` |
| **5 characters** (`10536`, `16600`) | a Division **10–16** code, already whole | **leave it** |
| anything else | not a MasterFormat 1995 section code | ⚠️ **refuse it; do not guess** |

⚠️ **Divisions 10–16 are the only ones that survive Excel intact**, because their codes start at
10000. **Never pad a 5-character code, and never trim one.**

---

# 2 — THE SIXTEEN DIVISIONS

| code | division |
| --- | --- |
| `01` | General Requirements |
| `02` | Sitework |
| `03` | Concrete |
| `04` | Masonry |
| `05` | Metals |
| `06` | Wood & Plastics |
| `07` | Thermal & Moisture Protection |
| `08` | Doors & Windows |
| `09` | Finishes |
| `10` | Specialties |
| `11` | Equipment |
| `12` | Furnishings |
| `13` | Special Construction |
| `14` | Conveying Systems |
| `15` | Mechanical |
| `16` | Electrical |

⚠️ **Josh's own budget names Division 01 "General Conditions" rather than "General Requirements."**
That is the common trade usage. **The company list is editable, so either name is fine — but the
DIVISION CODE is what the system keys on, never the title.**

---

# ⚠️ 3 — PROVENANCE. READ THIS BEFORE TREATING THE LIST AS AUTHORITATIVE.

**MasterFormat is published by the Construction Specifications Institute, and the 1995 edition is no
longer supported by CSI** — they moved to the 50-division format in 2004. **This file is not a
licensed copy of CSI's list.** It is a working starting template, assembled from:

- ⚠️ **`[IN USE]` — codes that appear in Josh's own documents.** These are facts, read off the files.
- **`[COMMON]` — codes in common trade usage for that division**, included so a company has somewhere
  to start. **Treat these as a seed to edit, not as a citation.**

**If an exact, complete MasterFormat 1995 section list is ever needed, it comes from CSI, not from
here.** ⚠️ **The company list is editable by design (H-1), so this file only has to be a good
starting point — not a complete one.**

---

# 4 — THE SECTION LIST

## Division 01 — General Requirements / General Conditions

| code | title | source |
| --- | --- | --- |
| `01000` | General Conditions | **[IN USE]** |
| `01100` | Summary of work | [COMMON] |
| `01200` | Price & payment procedures | [COMMON] |
| `01310` | Project coordination | [COMMON] |
| `01330` | Submittals | [COMMON] |
| `01400` | Quality requirements | [COMMON] |
| `01500` | Temporary facilities & controls | [COMMON] |
| `01600` | Product requirements | [COMMON] |
| `01700` | Execution & closeout | [COMMON] |
| `01740` | Cleaning | [COMMON] |

## Division 02 — Sitework

| code | title | source |
| --- | --- | --- |
| `02080` | Hazardous material abatement | **[IN USE]** |
| `02110` | Site clearing | **[IN USE]** |
| `02200` | Sitework / earthwork | **[IN USE]** |
| `02280` | Surveying & layout | **[IN USE]** |
| `02300` | Excavation & fill | [COMMON] |
| `02510` | Paving & curbing | **[IN USE]** |
| `02600` | Sewer & lift station | **[IN USE]** |
| `02660` | Water distribution | **[IN USE]** |
| `02661` | DDCV / fire line | **[IN USE]** |
| `02721` | Drainage | **[IN USE]** |
| `02810` | Irrigation | **[IN USE]** |
| `02900` | Landscaping & planting | **[IN USE]** |

## Division 03 — Concrete

| code | title | source |
| --- | --- | --- |
| `03100` | Concrete forming | [COMMON] |
| `03200` | Concrete reinforcing | [COMMON] |
| `03300` | Cast-in-place concrete | [COMMON] |
| `03350` | Concrete finishing | [COMMON] |
| `03400` | Precast concrete | [COMMON] |

## Division 04 — Masonry

| code | title | source |
| --- | --- | --- |
| `04200` | Unit masonry | [COMMON] |
| `04220` | Concrete unit masonry / concrete shell | **[IN USE]** |
| `04270` | Cladding | **[IN USE]** |
| `04400` | Stone | [COMMON] |

## Division 05 — Metals

| code | title | source |
| --- | --- | --- |
| `05120` | Structural steel | **[IN USE]** |
| `05210` | Steel joists | [COMMON] |
| `05310` | Steel deck | [COMMON] |
| `05500` | Metal fabrications | **[IN USE]** |
| `05520` | Handrails & railings | [COMMON] |

## Division 06 — Wood & Plastics (Carpentry)

| code | title | source |
| --- | --- | --- |
| `06100` | Rough carpentry / roof carpentry | **[IN USE]** |
| `06190` | Wood trusses | **[IN USE]** |
| `06200` | Finish carpentry | [COMMON] |
| `06220` | Millwork / exterior wood brackets | **[IN USE]** |
| `06400` | Architectural woodwork | **[IN USE]** |

## Division 07 — Thermal & Moisture Protection

| code | title | source |
| --- | --- | --- |
| `07100` | Waterproofing & damproofing | [COMMON] |
| `07200` | Insulation / open cell foam | **[IN USE]** |
| `07500` | Membrane roofing | [COMMON] |
| `07510` | Roofing | **[IN USE]** |
| `07600` | Flashing & sheet metal | [COMMON] |
| `07840` | Firestopping | [COMMON] |
| `07900` | Joint sealants / caulking | **[IN USE]** |

## Division 08 — Doors & Windows

| code | title | source |
| --- | --- | --- |
| `08110` | Steel doors & frames | [COMMON] |
| `08200` | Wood & plastic doors | [COMMON] |
| `08500` | Windows | [COMMON] |
| `08700` | Hardware | [COMMON] |
| `08800` | Glazing | [COMMON] |

## Division 09 — Finishes

| code | title | source |
| --- | --- | --- |
| `09200` | Plaster & stucco | **[IN USE]** |
| `09250` | Gypsum board / drywall | **[IN USE]** |
| `09300` | Tile | [COMMON] |
| `09500` | Acoustical ceilings | **[IN USE]** |
| `09540` | Specialty ceilings & siding | **[IN USE]** |
| `09650` | Resilient flooring | [COMMON] |
| `09680` | Carpet / flooring | **[IN USE]** |
| `09900` | Painting | [COMMON] |
| `09920` | Interior painting | **[IN USE]** |

## Division 10 — Specialties

| code | title | source |
| --- | --- | --- |
| `10200` | Louvers & vents | [COMMON] |
| `10440` | Signage | [COMMON] |
| `10536` | Pergolas & canopies | **[IN USE]** |
| `10550` | Aluminum sunshades | **[IN USE]** |
| `10800` | Toilet accessories | **[IN USE]** |

## Division 11 — Equipment

| code | title | source |
| --- | --- | --- |
| `11400` | Food service equipment | [COMMON] |
| `11450` | Residential appliances | [COMMON] |

## Division 12 — Furnishings

| code | title | source |
| --- | --- | --- |
| `12300` | Casework & cabinets | [COMMON] |
| `12500` | Furniture (FF&E) | [COMMON] |
| `12900` | Furnishings accessories | [COMMON] |

## Division 13 — Special Construction

| code | title | source |
| --- | --- | --- |
| `13100` | Lightning protection | [COMMON] |
| `13150` | Swimming pools | [COMMON] |
| `13900` | Fire suppression | [COMMON] |

## Division 14 — Conveying Systems

| code | title | source |
| --- | --- | --- |
| `14200` | Elevators | [COMMON] |
| `14300` | Escalators & moving walks | [COMMON] |

## Division 15 — Mechanical

| code | title | source |
| --- | --- | --- |
| `15300` | Fire protection / sprinklers | [COMMON] |
| `15400` | Plumbing | [COMMON] |
| `15410` | Plumbing fixtures | [COMMON] |
| `15500` | Heating | [COMMON] |
| `15700` | HVAC | [COMMON] |
| `15800` | Air distribution | [COMMON] |

## Division 16 — Electrical

| code | title | source |
| --- | --- | --- |
| `16000` | Electrical | **[IN USE]** |
| `16100` | Wiring methods | [COMMON] |
| `16500` | Lighting | [COMMON] |
| `16600` | Fire alarm | **[IN USE]** |
| `16700` | Communications & low voltage | [COMMON] |

---

# ⚠️ 5 — WHAT THE SOURCE DOCUMENT GETS WRONG, AND WHY IT MATTERS

**The Itasca estimate in Sheet2 carries two real mis-codings. They are recorded here because an
importer will meet them, and because they show what the feature is for.**

**1 — Division 6 codes sitting under a Division 8 heading.** Under *"DIV. 8 DOORS & WINDOWS"* it lists
`6100 METAL DOORS FRAMES` and `6400 GLASS & GLAZING`. Padded, those are `06100` and `06400` —
**Carpentry**. Metal doors and frames belong at `08110`, glazing at `08800`.
⚠️ **And `06100` is used TWICE in the same sheet with different meanings** — once as Roof Carpentry
under Division 6, once as Metal Doors & Frames under Division 8.

**2 — Mechanical work with no codes at all, filed under Specialties.** *Fire sprinklers, plumbing,
kitchen hood system, HVAC* sit under *"DIV. 10 SPECIALTIES"* with the code column blank. They are
Division 15.

⚠️ **CONSEQUENCE FOR THE IMPORTER:** a code's own digits and the heading it sits under **can disagree,
and in a real document they do.**

- ⚠️ **The CODE decides the division. Never the heading it was typed under.**
- ⚠️ **A code that contradicts its heading is REPORTED, not corrected and not silently re-filed.** The
  person importing has to see it.
- ⚠️ **The same code appearing twice with different titles is reported too.** Do not merge them, and do
  not let the second overwrite the first.
- **A row with no code imports with no code**, into whatever division its heading names, flagged for
  someone to code later.

---

# 6 — WHERE THE BOTTOM BLOCK DIFFERS, AND WHY IT IS SETTABLE

**Two real bid sheets, two different answers, which is why H-8 makes the basis a choice rather than a
rule.**

| | Josh's budget | the Itasca estimate |
| --- | --- | --- |
| GC fee | **8%** of Sub Total | **6%** of Sub Total |
| insurance | **2%** of Sub Total **+ GC Fee** | **2%** of Sub Total only, called "Overhead & Insurance" |
| order | fee, then insurance | insurance, then fee |

⚠️ **Josh's own note in the margin of his sheet:** *"Added GC fee to calculation. Most providers
calculate based on revenue, not cost."* **The base was a deliberate decision he had to write down for
anyone to know. That is the whole argument for H-8a.**

---

# 7 — RULES FOR THE SEEDED LIST

- **Seeded per company**, editable: a company may add, rename and remove both divisions and sections
  (H-1).
- ⚠️ **An estimate SNAPSHOTS the list at creation** (H-12). Later edits reach new estimates only.
- ⚠️ **Removing a section that codes already reference does not rewrite those codes.** The code stays
  on the line; the list is a lookup, not the owner of the data.
- **A company may use a code that is not in the list.** ⚠️ **Accept it if it is a valid 5-character
  code, and say it is unlisted. Do not refuse work because a lookup is incomplete.**