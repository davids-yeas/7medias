# Snotrac Studio

Application web (HTML, CSS, JavaScript) qui calcule le format à plat des cartons FEFCO :
plan coté, laize, coupe, surface, vue 3D, favoris, historique et fiche PDF.

Dossier à déployer : `fefco/` (site statique + une fonction serverless `api/history.js`).

## Déployer sur Vercel (historique partagé par code d'accès)

1. **Importer le projet** : vercel.com > *Add New* > *Project* > choisir le dépôt `7medias`.
   - *Root Directory* : `fefco`
   - *Framework Preset* : `Other`
   - *Build Command* et *Output Directory* : laisser vides
   - *Branche de production* : `claude/fefco-plans` (ou `master` une fois la branche fusionnée)
   - Cliquer sur *Deploy*.
2. **Créer la base** : dans le projet Vercel > onglet *Storage* > *Create Database* > **Upstash for Redis**
   (offre gratuite, région Europe) > *Connect to Project*. Les variables `KV_REST_API_URL` et
   `KV_REST_API_TOKEN` sont ajoutées automatiquement.
3. **Choisir le code d'accès** : *Settings* > *Environment Variables* > ajouter
   `ACCESS_CODE` = 6 caractères, chiffres et lettres (ex. `K7M2QX`), pour *Production* et *Preview*.
4. **Redéployer** : *Deployments* > menu `...` du dernier déploiement > *Redeploy*
   (indispensable pour que les variables soient prises en compte).
5. **Tester** : ouvrir l'adresse Vercel > onglet *Historique* > saisir le code.

Pour changer le code : modifier `ACCESS_CODE` puis redéployer. Les appareils déjà connectés
redemanderont le nouveau code.

## Fonctionnement et limites

- Sans `ACCESS_CODE` ni base, l'historique reste local à chaque appareil (aucune erreur).
- Le code est vérifié côté serveur. Après 15 essais faux en 10 minutes depuis une même adresse IP, l'accès est bloqué temporairement.
- Chacun voit tous les calculs de l'équipe, mais ne supprime que les siens (identifiés par appareil).
- Sont enregistrés : modèle, dimensions, laize, coupe, prénom facultatif et nom du client si le champ « Client » est rempli. Ne mets pas d'information sensible dans ce champ.
- Le code est un mot de passe partagé : adapté à un usage interne, pas à des données sensibles.
- Favoris et derniers modèles restent propres à chaque appareil.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html`, `style.css` | page et charte Snotrac |
| `styles.js` | géométrie des codes FEFCO (formules) |
| `catalog.js` | liste des 325 codes relevés dans le PDF (séries 0100 à 0900) |
| `app.js`, `app3d.js` | application, vue 3D |
| `config.js` | active l'historique partagé |
| `api/history.js` | fonction serverless (code d'accès + Redis) |
