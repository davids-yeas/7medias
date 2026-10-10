# Relevés des pages du PDF FEFCO

Fiches JSON produites en lisant les pages du PDF FEFCO (12e édition), une par code :
mode de montage, page, titre, et pour les codes représentables la description du plan (`spec`).

- `CONSIGNES.md` : format des fiches et règle de relevé (aucune cote inventée).
- `pNN.json` : fiches des pages à partir de NN.
- `integrer.py` : ajoute les fiches représentables dans `fefco/styles.js` (tableau `FROM_PDF`)
  et complète `fefco/catalog.js`. Lancer : `python3 releves-fefco/integrer.py`.

Pages déjà intégrées à la main dans `styles.js` : 18 à 35, 45 à 51.
Pages relevées et intégrées par `integrer.py` : 36 à 40, 64 à 144.
Pages restant à relever : 52 à 63 (série 0400, codes 0424 à 0452).
Codes non représentables (cotes non écrites) : listés dans les fiches avec "representable": false.
