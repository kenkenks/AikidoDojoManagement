# Phase B: Dojo / Teacher v2 + CSS consolidation

## Teacher
- A7 member card skeleton reused exactly
- no separate large teacher icon layout
- teacher accent only changes color
- name / role / teacher_id / QR / footer follow member hierarchy

## Dojo
- A5 poster retained
- location name and ID grouped in `.dojo-meta`
- 5mm separation before QR zone
- QR frame 86mm, QR body 76mm
- prevents metadata/QR overlap

## CSS
- consolidated one `qr-sheet.css` covers:
  - member A7
  - teacher A7
  - payment 50x50
  - dojo A5
- named print pages avoid @page rules overwriting each other
