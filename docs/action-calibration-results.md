# Action calibration results

Engineering reference agents under the actual game rules. These results do not establish human population difficulty. No runtime opponent reads the human score or targets a win quota.

100 fixed seeds; rosters 2, 6, 12, 16; 40,500 opponent runs; 14,700 action replays; 0 parity failures.

## Individual opponent score distribution

| Game               | Version         | Profile    |    P10 |  Median |     P90 | 120s cap |
| ------------------ | --------------- | ---------- | -----: | ------: | ------: | -------: |
| quickTapVipRace    | main-d41693d8   | developing | 576.00 |  837.00 | 1039.50 |        — |
| quickTapVipRace    | tested-bc2d2a03 | developing | 510.50 |  646.00 |  789.50 |        — |
| quickTapVipRace    | candidate       | developing | 398.50 |  819.00 | 1216.00 |        — |
| quickTapVipRace    | main-d41693d8   | neutral    | 605.00 |  860.00 | 1063.50 |        — |
| quickTapVipRace    | tested-bc2d2a03 | neutral    | 534.50 |  670.50 |  820.00 |        — |
| quickTapVipRace    | candidate       | neutral    | 446.00 |  925.50 | 1359.00 |        — |
| quickTapVipRace    | main-d41693d8   | skilled    | 633.50 |  886.50 | 1105.50 |        — |
| quickTapVipRace    | tested-bc2d2a03 | skilled    | 562.50 |  699.00 |  855.50 |        — |
| quickTapVipRace    | candidate       | skilled    | 511.50 | 1048.00 | 1557.50 |        — |
| quickTapVipSeasons | main-d41693d8   | developing | 490.75 |  726.75 |  973.25 |        — |
| quickTapVipSeasons | tested-bc2d2a03 | developing | 423.00 |  576.25 |  752.50 |        — |
| quickTapVipSeasons | candidate       | developing | 367.25 |  764.00 | 1138.25 |        — |
| quickTapVipSeasons | main-d41693d8   | neutral    | 516.50 |  759.00 | 1010.25 |        — |
| quickTapVipSeasons | tested-bc2d2a03 | neutral    | 442.63 |  606.00 |  786.50 |        — |
| quickTapVipSeasons | candidate       | neutral    | 420.50 |  861.75 | 1302.00 |        — |
| quickTapVipSeasons | main-d41693d8   | skilled    | 547.00 |  797.38 | 1060.50 |        — |
| quickTapVipSeasons | tested-bc2d2a03 | skilled    | 469.25 |  639.75 |  819.00 |        — |
| quickTapVipSeasons | candidate       | skilled    | 480.75 |  992.00 | 1481.88 |        — |
| pressurePlank      | main-d41693d8   | developing |  18.00 |   59.00 |   89.00 |     0.0% |
| pressurePlank      | tested-bc2d2a03 | developing |  18.00 |   59.00 |   89.00 |     0.0% |
| pressurePlank      | candidate       | developing |  34.72 |   65.99 |   88.90 |     0.0% |
| pressurePlank      | main-d41693d8   | neutral    |  22.00 |   65.00 |   95.00 |     1.6% |
| pressurePlank      | tested-bc2d2a03 | neutral    |  22.00 |   65.00 |   95.00 |     1.6% |
| pressurePlank      | candidate       | neutral    |  46.29 |   74.41 |  101.56 |     0.5% |
| pressurePlank      | main-d41693d8   | skilled    |  43.00 |   72.00 |  120.00 |    13.7% |
| pressurePlank      | tested-bc2d2a03 | skilled    |  43.00 |   72.00 |  120.00 |    13.7% |
| pressurePlank      | candidate       | skilled    |  64.69 |   86.09 |  119.96 |     9.9% |

## Reference against the entire field

Neutral skill profiles, largest roster. Strict wins exclude exact ties; ties use the game’s normal tie resolution. Margin = reference minus strongest opponent. Screenshot anchors are fixed observed scores; their original seeds and inputs are unavailable.

| Game               | Version         | Reference        | Reference median | Best AI median | Strict wins |  Ties | Median margin | Median relative margin |
| ------------------ | --------------- | ---------------- | ---------------: | -------------: | ----------: | ----: | ------------: | ---------------------: |
| quickTapVipRace    | main-d41693d8   | oneFinger        |           441.00 |        1111.00 |        0.0% |  0.0% |       -678.00 |                 -60.2% |
| quickTapVipRace    | main-d41693d8   | twoFinger        |           883.00 |        1111.00 |        0.0% |  0.0% |       -234.00 |                 -20.9% |
| quickTapVipRace    | main-d41693d8   | threeFinger      |          1340.50 |        1111.00 |       99.0% |  0.0% |        226.00 |                  19.8% |
| quickTapVipRace    | main-d41693d8   | practiced        |          1558.00 |        1111.00 |      100.0% |  0.0% |        446.00 |                  39.9% |
| quickTapVipRace    | tested-bc2d2a03 | oneFinger        |           441.00 |         859.50 |        0.0% |  0.0% |       -413.50 |                 -48.2% |
| quickTapVipRace    | tested-bc2d2a03 | twoFinger        |           883.00 |         859.50 |       62.0% |  0.0% |         27.00 |                   3.0% |
| quickTapVipRace    | tested-bc2d2a03 | threeFinger      |          1340.50 |         859.50 |      100.0% |  0.0% |        479.00 |                  56.1% |
| quickTapVipRace    | tested-bc2d2a03 | practiced        |          1558.00 |         859.50 |      100.0% |  0.0% |        702.50 |                  83.0% |
| quickTapVipRace    | candidate       | oneFinger        |           441.00 |        1378.50 |        0.0% |  0.0% |       -935.00 |                 -67.8% |
| quickTapVipRace    | candidate       | twoFinger        |           883.00 |        1378.50 |        0.0% |  0.0% |       -499.00 |                 -36.2% |
| quickTapVipRace    | candidate       | threeFinger      |          1340.50 |        1378.50 |       28.0% |  0.0% |        -39.50 |                  -3.0% |
| quickTapVipRace    | candidate       | practiced        |          1558.00 |        1378.50 |      100.0% |  0.0% |        185.00 |                  13.6% |
| quickTapVipSeasons | main-d41693d8   | oneFinger        |           414.25 |        1033.63 |        0.0% |  0.0% |       -617.25 |                 -60.3% |
| quickTapVipSeasons | main-d41693d8   | twoFinger        |           798.38 |        1033.63 |        0.0% |  0.0% |       -228.13 |                 -22.3% |
| quickTapVipSeasons | main-d41693d8   | threeFinger      |          1226.75 |        1033.63 |       91.0% |  0.0% |        163.00 |                  17.0% |
| quickTapVipSeasons | main-d41693d8   | practiced        |          1419.13 |        1033.63 |      100.0% |  0.0% |        386.25 |                  37.8% |
| quickTapVipSeasons | main-d41693d8   | observed 1063.63 |          1063.63 |        1033.63 |       61.0% |  0.0% |         27.51 |                   2.7% |
| quickTapVipSeasons | tested-bc2d2a03 | oneFinger        |           414.25 |         822.00 |        0.0% |  0.0% |       -399.75 |                 -48.3% |
| quickTapVipSeasons | tested-bc2d2a03 | twoFinger        |           798.38 |         822.00 |       43.0% |  0.0% |         -7.88 |                  -1.0% |
| quickTapVipSeasons | tested-bc2d2a03 | threeFinger      |          1226.75 |         822.00 |      100.0% |  0.0% |        397.63 |                  51.6% |
| quickTapVipSeasons | tested-bc2d2a03 | practiced        |          1419.13 |         822.00 |      100.0% |  0.0% |        634.25 |                  80.5% |
| quickTapVipSeasons | tested-bc2d2a03 | observed 1063.63 |          1063.63 |         822.00 |      100.0% |  0.0% |        239.63 |                  29.1% |
| quickTapVipSeasons | candidate       | oneFinger        |           414.25 |        1316.88 |        0.0% |  0.0% |       -898.88 |                 -67.9% |
| quickTapVipSeasons | candidate       | twoFinger        |           798.38 |        1316.88 |        0.0% |  0.0% |       -489.00 |                 -37.6% |
| quickTapVipSeasons | candidate       | threeFinger      |          1226.75 |        1316.88 |       24.0% |  0.0% |        -82.13 |                  -6.2% |
| quickTapVipSeasons | candidate       | practiced        |          1419.13 |        1316.88 |       83.0% |  0.0% |        146.88 |                  11.0% |
| quickTapVipSeasons | candidate       | observed 1063.63 |          1063.63 |        1316.88 |       11.0% |  0.0% |       -255.37 |                 -19.4% |
| pressurePlank      | main-d41693d8   | weak             |            27.40 |         109.00 |        0.0% |  0.0% |        -80.00 |                 -74.3% |
| pressurePlank      | main-d41693d8   | competent        |            67.17 |         109.00 |        0.0% |  0.0% |        -41.29 |                 -38.2% |
| pressurePlank      | main-d41693d8   | strong           |           102.28 |         109.00 |       38.0% |  1.0% |         -3.64 |                  -3.3% |
| pressurePlank      | main-d41693d8   | practiced        |           120.00 |         109.00 |       79.0% | 21.0% |         10.00 |                   9.1% |
| pressurePlank      | main-d41693d8   | observed 97.780s |            97.78 |         109.00 |       39.0% |  0.0% |        -12.22 |                 -11.1% |
| pressurePlank      | tested-bc2d2a03 | weak             |            27.40 |         109.00 |        0.0% |  0.0% |        -80.00 |                 -74.3% |
| pressurePlank      | tested-bc2d2a03 | competent        |            67.17 |         109.00 |        0.0% |  0.0% |        -41.29 |                 -38.2% |
| pressurePlank      | tested-bc2d2a03 | strong           |           102.28 |         109.00 |       38.0% |  1.0% |         -3.64 |                  -3.3% |
| pressurePlank      | tested-bc2d2a03 | practiced        |           120.00 |         109.00 |       79.0% | 21.0% |         10.00 |                   9.1% |
| pressurePlank      | tested-bc2d2a03 | observed 97.780s |            97.78 |         109.00 |       39.0% |  0.0% |        -12.22 |                 -11.1% |
| pressurePlank      | candidate       | weak             |            27.40 |         109.08 |        0.0% |  0.0% |        -81.33 |                 -74.1% |
| pressurePlank      | candidate       | competent        |            67.17 |         109.08 |        0.0% |  0.0% |        -41.12 |                 -37.9% |
| pressurePlank      | candidate       | strong           |           102.28 |         109.08 |       24.0% |  1.0% |         -6.37 |                  -5.6% |
| pressurePlank      | candidate       | practiced        |           120.00 |         109.08 |       92.0% |  8.0% |         10.90 |                  10.0% |
| pressurePlank      | candidate       | observed 97.780s |            97.78 |         109.08 |       11.0% |  0.0% |        -11.32 |                 -10.4% |

## Candidate roster sensitivity

| Game               | Roster | Reference        | Strict wins | Ties | Median margin |
| ------------------ | -----: | ---------------- | ----------: | ---: | ------------: |
| quickTapVipRace    |      2 | threeFinger      |       84.0% | 0.0% |        433.00 |
| quickTapVipRace    |      6 | threeFinger      |       54.0% | 0.0% |          9.00 |
| quickTapVipRace    |     12 | threeFinger      |       33.0% | 0.0% |        -29.00 |
| quickTapVipRace    |     16 | threeFinger      |       28.0% | 0.0% |        -39.50 |
| quickTapVipSeasons |      2 | threeFinger      |       82.0% | 0.0% |        278.88 |
| quickTapVipSeasons |      2 | observed 1063.63 |       66.0% | 0.0% |        193.26 |
| quickTapVipSeasons |      6 | threeFinger      |       51.0% | 0.0% |          4.38 |
| quickTapVipSeasons |      6 | observed 1063.63 |       22.0% | 0.0% |       -180.99 |
| quickTapVipSeasons |     12 | threeFinger      |       32.0% | 0.0% |        -60.50 |
| quickTapVipSeasons |     12 | observed 1063.63 |       16.0% | 0.0% |       -231.87 |
| quickTapVipSeasons |     16 | threeFinger      |       24.0% | 0.0% |        -82.13 |
| quickTapVipSeasons |     16 | observed 1063.63 |       11.0% | 0.0% |       -255.37 |
| pressurePlank      |      2 | strong           |       89.0% | 0.0% |         30.16 |
| pressurePlank      |      2 | observed 97.780s |       91.0% | 0.0% |         25.60 |
| pressurePlank      |      6 | strong           |       54.0% | 0.0% |          2.83 |
| pressurePlank      |      6 | observed 97.780s |       53.0% | 0.0% |          0.49 |
| pressurePlank      |     12 | strong           |       33.0% | 1.0% |         -3.61 |
| pressurePlank      |     12 | observed 97.780s |       23.0% | 0.0% |        -10.46 |
| pressurePlank      |     16 | strong           |       24.0% | 1.0% |         -6.37 |
| pressurePlank      |     16 | observed 97.780s |       11.0% | 0.0% |        -11.32 |

## Limits and scope

- Covered runtime paths: VIP Quick Tap Race, VIP Quick Tap Seasons, and Pressure Plank. Other minigames, including standard tapping variants and Deck of Light, require their own adapters and parity checks.
- Finger-style weights, cadence ranges and controller reaction/error settings are explicit design assumptions, not measured population percentiles. Change these assumptions and rerun the report when evidence warrants it.
- Strongest-field comparisons expose roster-size effects; average-opponent results alone are insufficient.
- Pressure Plank has a real 120-second cap. Practiced controllers can reach it; capped ties must remain visible instead of being hidden by fabricated survival times.
- Pointer tests verify live scoring separately. Device feel and human population calibration still need limited release feedback; this framework replaces repetitive manual regression play.

## Independent holdout

100 additional seeds, 5000–5099, evaluated after the parameter choices above: 13,500 opponent runs; 14,700 action replays; zero parity failures. Neutral profiles, 16 contestants.

| Game               | Reference        | Strict wins | Ties | Median margin |
| ------------------ | ---------------- | ----------: | ---: | ------------: |
| quickTapVipRace    | threeFinger      |       22.0% | 0.0% |        -52.00 |
| quickTapVipRace    | practiced        |       99.0% | 0.0% |        202.00 |
| quickTapVipSeasons | threeFinger      |       26.0% | 0.0% |        -56.00 |
| quickTapVipSeasons | practiced        |       86.0% | 0.0% |        109.25 |
| quickTapVipSeasons | observed 1063.63 |        5.0% | 0.0% |       -216.87 |
| pressurePlank      | strong           |       18.0% | 0.0% |         -7.85 |
| pressurePlank      | practiced        |       91.0% | 9.0% |         10.65 |
| pressurePlank      | observed 97.780s |       11.0% | 0.0% |        -11.57 |
