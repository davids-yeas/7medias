# Relevé des pages FEFCO (images) pour Snotrac Studio

Les pages du PDF FEFCO Code (12e édition) sont des images : pages/pNN.jpg (images des pages du PDF, dossier Drive) (NN = numéro imprimé en bas de page).
Chaque page montre 1 à 3 codes : titre « 0xxx M/A », dessin à plat (traits noirs = coupe, tirets rouges = plis), cotes écrites (L, W, H, ½W, ½L, v, o, L+, W+, H+, ½(W+o)...).
Lis chaque page avec l'outil Read (une image par appel). Si un détail est trop petit, recadre/zoome avec python3 (PIL disponible) dans ton propre dossier scratch, puis relis.

Pour CHAQUE code de tes pages, rends une entrée JSON :
{ "code": "0501", "mode": "M" | "A" | "M/A", "page": 52, "titre_fr": "nom court en français", "new": true|false (badge NEW),
  "representable": true|false, "raison": "si false : pourquoi (cotes non écrites, découpe complexe, verrouillage...)",
  "spec": ... }

Règle stricte : representable=true seulement si TOUTES les longueurs du contour principal sont soit écrites sur le dessin, soit visuellement égales (mesure en pixels, ±5 %) à une cote écrite du même dessin. N'invente aucune valeur. Encoches, languettes de verrouillage, poignées, arrondis, petites pattes = détails ignorables (signale-les dans "simplifie"). Si une bande dont la largeur n'est ni écrite ni égale à une cote écrite fait partie du contour → representable=false.

Formats de "spec" disponibles (choisis-en un) :
1. "slotted" : panneaux côte à côte reliés par plis verticaux, corps de hauteur H (ou autre jeton), rabats en haut/bas.
   { "type":"slotted", "joint": true|false, "bodyH":"H", "seq": [["L","½W","½W"],["W","½W","½W"],...] }
   chaque panneau = [largeur, rabat haut, rabat bas] ; "0" = pas de rabat. Ordre de gauche à droite tel que dessiné.
2. "tray" (fond + parois, en croix ou à coins) : { "type":"tray", "corner":"side"|"end"|"gusset"|null, "diag":bool, "cdiag":bool, "lid":false|"H+"|"v" }
   side = coins rattachés aux parois gauche/droite (fentes sur les plis verticaux) ; end = coins rattachés aux parois haut/bas ; gusset = pas de fente, coins pliés en diagonale ; null = croix sans coins.
3. "crossX" : fond central (largeur horizontale × hauteur verticale : précise lesquels, ex. "L×W" ou "W×L"), puis de chaque côté une suite de bandes de l'intérieur vers l'extérieur :
   { "type":"crossX", "centre":"L×W", "lr":["H","½L"], "tb":["H","½W"] } (lr = gauche et droite identiques, tb = haut et bas identiques ; si gauche≠droite ou haut≠bas, donne "left","right","top","bottom" séparément)
4. "band" : une bande de panneaux de même hauteur : { "type":"band", "h":"L+", "cols":["½W+","H+","W+","H+","½W+"] }
5. "pieces" : plusieurs pièces séparées : { "type":"pieces", "items":[ {"n":"Fond","qty":1,"spec":{...}}, ... ] }
6. "other" : décris précisément (liste de rectangles avec position relative et cote) si aucun format ne convient.

Jetons autorisés : L, W, H, ½L, ½W, ½H, v, o, L+, W+, H+, ½L+, ½W+, ½(W+o), ½(L+o), v+o, L−v, W−v, et combinaisons simples écrites sur le dessin (ex. "H+v", "2H") — recopie exactement l'écriture du dessin.

Rends à la fin UNIQUEMENT un tableau JSON (pas de texte autour), toutes les entrées de tes pages, dans l'ordre des pages. Sois précis : ces données servent à produire des plans de fabrication.
