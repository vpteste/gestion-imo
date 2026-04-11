# Logiciel de Gestion Immobilière — V1 Web

Plateforme web responsive de gestion locative, **100 % open source et gratuite**.

## Fonctionnalités V1

| Module | Description |
|---|---|
| **Authentification** | JWT + RBAC (Admin, Agent, Propriétaire, Locataire) |
| **Provisioning comptes** | Création admin, statut pending, activation par token |
| **Biens** | CRUD, attribution propriétaire, carte Leaflet/OSM |
| **Contrats** | Upload, archivage, téléchargement de fichiers |
| **Paiements** | Suivi statuts (payé / retard / impayé), alertes |
| **Quittances** | Génération PDF + rappel e-mail (Nodemailer) |
| **Dashboard** | KPI, graphiques (Recharts), répartition géographique |
| **Incidents** | Signalement locataire + suivi par admin/agent/propriétaire |
| **États des lieux** | Planification, suivi et signature locataire |
| **Journaux d'activité** | Audit API consultable par l'admin |

---

## Architecture

```
gestion/
├── apps/
│   ├── api/          # Backend NestJS (port 3001)
│   └── web/          # Frontend Next.js 14 (port 3000)
├── packages/
│   ├── shared/       # Types TypeScript partagés
│   └── database/     # Schéma Prisma + PostgreSQL
└── infra/
    ├── docker-compose.yml          # PostgreSQL + MinIO (développement)
    └── docker-compose.prod.yml     # Stack complète (production)
```

**Stack :** Next.js · NestJS · TypeScript · PostgreSQL · Prisma · Tailwind CSS · Recharts · Leaflet/OSM · PDFKit · Nodemailer · Docker

---

## Démarrage rapide (développement local)

### Prérequis

- Node.js ≥ 20
- Docker Desktop (pour PostgreSQL + MinIO)

### 1. Démarrer la base de données

```bash
docker compose -f infra/docker-compose.yml up -d
```

### 2. Installer les dépendances

```bash
npm install
```

### 3. Configurer l'environnement

```bash
copy .env.example .env
# Éditer .env avec vos valeurs (JWT_SECRET, DATABASE_URL, etc.)
```

### 4. Générer le client Prisma

```bash
npm run db:generate
npm run db:migrate   # crée les tables
```

### 5. Lancer les serveurs

```bash
# Terminal 1 — API NestJS
npm run dev:api

# Terminal 2 — Frontend Next.js (avec nettoyage cache)
npm run dev:web:clean
```

L'interface est disponible sur **http://localhost:3000**
L'API est disponible sur **http://localhost:3001**

---

## Basculer vers Supabase (tests)

1. Créer un projet Supabase puis récupérer la chaîne PostgreSQL (Transaction pooler ou Direct).

2. Remplacer `DATABASE_URL` dans `.env` par la valeur Supabase:

```bash
DATABASE_URL="postgresql://postgres.<project-ref>:<password>@<host>:6543/postgres?sslmode=require"
```

3. Appliquer le schéma sur Supabase:

```bash
npm run db:generate
npm run db:migrate
```

4. Charger les données de test (inclut les comptes test admin/agent/propriétaire/locataire):

```bash
npm run db:seed
```

5. Redémarrer l'API et le web:

```bash
npm run dev:api
npm run dev:web:clean
```

6. Vérifier la connexion avec:

- `admin.test.20260408235645@gestion.local`
- `agent.test.20260408235645@gestion.local`
- `owner.test.20260408235645@gestion.local`
- `tenant.test.20260408235645@gestion.local`

Mot de passe de test seed: `Test@2026!`

---

## Déploiement avec Docker (production)

```bash
# Copier et adapter les variables
copy .env.example .env
# Éditer JWT_SECRET, POSTGRES_PASSWORD, CORS_ORIGIN, NEXT_PUBLIC_API_URL

# Construire et démarrer les 4 services
docker compose -f infra/docker-compose.prod.yml up -d --build
```

Services démarrés : `postgres` · `minio` · `api` · `web`

---

## Variables d'environnement

| Variable | Défaut dev | Description |
|---|---|---|
| `DATABASE_URL` | (SQLite local) | URL PostgreSQL |
| `JWT_SECRET` | `dev_secret` | Secret JWT (à changer en prod) |
| `CORS_ORIGIN` | `*` | Origine(s) autorisées (ex: `https://monapp.com`) |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` | URL API côté client |
| `POSTGRES_USER` | `gestion` | Utilisateur PostgreSQL |
| `POSTGRES_PASSWORD` | `gestion` | Mot de passe PostgreSQL |
| `POSTGRES_DB` | `gestion` | Nom de la base |
| `MINIO_ROOT_USER` | `minioadmin` | Accès MinIO |
| `MINIO_ROOT_PASSWORD` | `minioadmin` | Mot de passe MinIO |

---

## Scripts disponibles

| Commande | Description |
|---|---|
| `npm run dev:web:clean` | Démarre le frontend (nettoie le cache webpack avant) |
| `npm run dev:api` | Démarre l'API en mode développement |
| `npm run build` | Compile shared + api + web |
| `npm run verify` | Build complet + tests API |
| `npm run test -w apps/api` | Lance les tests Jest (unité + E2E) |
| `npm run release:check` | Build complet + tests (checklist pre-release) |
| `npm run db:generate` | Génère le client Prisma |
| `npm run db:migrate` | Applique les migrations de schéma |
| `npm run db:studio` | Lance Prisma Studio (UI base de données) |

---

## Rôles et accès

| Rôle | Biens | Contrats | Paiements | Dashboard | Incidents | États des lieux | Journaux |
|---|---|---|---|---|---|---|---|
| `admin` | CRUD global | Upload + téléchargement | Tout | Tout | Tout | Tout | Lecture |
| `agent` | Portefeuille agent uniquement | Portefeuille agent uniquement | Portefeuille agent uniquement | Portefeuille agent uniquement | Portefeuille agent uniquement | Portefeuille agent uniquement | — |
| `proprietaire` | Lecture sur ses biens | Téléchargement sur ses biens | Lecture sur ses biens | Lecture sur ses biens | Lecture + MAJ statut sur ses biens | Lecture + MAJ statut sur ses biens | — |
| `locataire` | — | Téléchargement selon son bail | Lecture seule personnelle | — | Création + lecture personnelles | Lecture + signature sur son bail | — |

> En développement, le rôle est transmis via l'en-tête `x-user-role`. En production, utiliser le token JWT fourni par `POST /auth/login`.

---

## Provisioning Admin et activation

Flux sécurisé implémenté:

1. L'admin crée un compte via `POST /auth/users/provision`.
2. Le compte est créé avec `status: pending`.
3. Le système génère un token d'activation (TTL 24h) et un e-mail d'activation (mode local stream transport).
4. L'utilisateur active son compte via `POST /auth/activate` et définit son mot de passe.
5. La connexion `POST /auth/login` n'est possible qu'en statut `active`.

Exigences de couplage identité/métier:

- `locataire`: nécessite `leaseId` ou `propertyId`.
- `proprietaire`: nécessite au moins un `propertyIds`.
- `agent`: supporte un périmètre logique via `agency`.

Endpoints admin associés:

- `GET /auth/users` : lister les comptes.
- `PATCH /auth/users/:id/suspend` : suspendre un compte.
- `PATCH /auth/users/:id/role` : réattribuer le rôle et le couplage.

Page web admin:

- `/gestion-utilisateurs` pour provisionner, visualiser et suspendre.

---

## Sauvegarde et restauration

```powershell
# Sauvegarder la base
.\infra\scripts\backup-db.ps1

# Restaurer depuis une sauvegarde
.\infra\scripts\restore-db.ps1 -BackupFile .\backup_20260408.sql
```

---

## Tests

```bash
# Tests unitaires + E2E
npm run test -w apps/api -- --runInBand
```

Couverture actuelle : **3 suites · 16 tests (100 % PASS)**

---

## Contraintes V1

- Web responsive uniquement (pas d'application mobile native)
- Stockage fichiers local (dossier `storage/`) — à migrer vers MinIO en V1.5
- Géocodage des biens : dictionnaire statique de villes françaises (API Adresse en V1.5)
- Pas de signature électronique (prévu en V1.5 avec Documenso auto-hébergé)
