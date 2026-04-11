# Avancement et Plan

## Avancement au 8 avril 2026

### Socle technique

- Monorepo Next.js + NestJS + packages partages en place.
- Build API et Web passants.
- Tests API: 3 suites, 16 tests passants.
- TypeScript 5.9.3 fully configured (moduleResolution bundler/node10, Jest types OK).
- UTF-8 encoding corrected across all source files.
- Next.js server running on port 3000, API on port 3001.

### RBAC et securite metier

- RBAC applique sur API et frontend pour: admin, agent, proprietaire, locataire.
- Cloisonnement agent applique au portefeuille (biens, locataires, contrats, paiements, dashboard).
- Cloisonnement proprietaire applique a ses actifs.
- Cloisonnement locataire applique a ses donnees personnelles.

### Modules fonctionnels disponibles

- Biens: CRUD + filtrage role.
- Locataires: gestion + filtrage role.
- Contrats: upload/list/download avec controles d'acces.
- Paiements: suivi, alertes, quittances PDF, relances email locales.
- Dashboard: agregations role-aware.
- Incidents: creation locataire + suivi exploitation.
- Etats des lieux: planification, suivi et signature locataire.
  - ✓ Upload photos entrée/sortie (multer disk storage, 10MB, MIME whitelist)
  - ✓ Notes entrée/sortie/générales
  - ✓ Galerie photos avec lightbox full-screen
  - ✓ RBAC: ADMIN/AGENT only pour upload, LOCATAIRE/PROPRIETAIRE en lecture
  - ✓ Statut inspections: Planifié → Réalisé → Validé
- Journaux d'activite: collecte middleware + consultation admin.

### Provisioning Admin (nouveau)

- Creation de compte admin via endpoint dedie.
- Statut de compte pending a la creation.
- Token d'activation genere (TTL 24h) + email local.
- Activation par l'utilisateur avec definition de mot de passe.
- Connexion refusee tant que le compte n'est pas active.
- Suspension de compte et reassignment de role par admin.
- Couplage identite/metier impose selon role:
  - locataire => leaseId ou propertyId
  - proprietaire => propertyIds[]
  - agent => agency (perimetre logique)

## Corrections et optimisations (session 8 avril 2026)

- ✓ API 404 errors corrigés (rebuild dist après refactoring)
- ✓ Upload photos + notes entrée/sortie dans états des lieux
- ✓ TypeScript errors: moduleResolution, Jest types, rootDir séparé pour build
- ✓ UTF-8 double-encoding fixed across all TSX files
- ✓ RBAC: upload photos limité à ADMIN/AGENT only
- ✓ UI: remplacement emojis/caractères garbled (✕, 📷)
- ✓ Next.js: suppression Content-Type override cassant CSS/JS
- ✓ Next.js: suppression Content-Type override cassant CSS/JS
- ✓ **Production Mode**: suppression totale des données démo
  - auth.service.ts: DEMO_USERS[] = []
  - inspections.service.ts: inspections[] = []
  - incidents.service.ts: incidents[] = []
  - login/page.tsx: DEMO_ACCOUNTS[] = [], boutons démo supprimés
  - etats-des-lieux/page.tsx: valeurs démo vides
  - incidents/page.tsx: valeurs démo vides
- ✓ Build passante: next build OK, API compile OK, shared OK
- ✓ Serveurs opérationnels: API /health 200, Frontend / 200

## Plan de travail (prochaine iteration)

## Priorite 1

- Signature electronique V1.5-ready:
  - abstraction de service de signature,
  - statut de signature sur contrats,
  - ecrans de suivi de signature.

## Priorite 2

- Parametrage systeme admin:
  - configuration applicative,
  - sauvegarde/export,
  - ecran de maintenance.

## Priorite 3

- Durcissement production:
  - suppression progressive du fallback headers x-user-* hors dev,
  - migration complete des modules en persistance Prisma,
  - journalisation persistante (base ou object storage),
  - pipeline CI avec E2E web stabilise.

## Priorite 4

- Enhancements UX:
  - pagination/listes volumineuses,
  - filtres avances multi-criteres,
  - export PDF/CSV role-aware.

## Mise a jour au 9 avril 2026

### Validation de bascule Supabase

- Base de donnees projet basculee vers Supabase (URLs pooler/direct configurees).
- Prisma schema synchronise avec la base distante (db push effectue).
- Seed execute avec les comptes de test metier (admin/agent/proprietaire/locataire).
- API redemarree et endpoints de sante/auth verifies.

### Stabilisation Authentification

- Reconnexion corrigee: login DB-first (Prisma) avec compatibilite mot de passe legacy.
- Fallback local conserve en mode secours (disponibilite degradee).
- Comptes de test actives verifies:
  - admin.test.20260408235645@gestion.local
  - agent.test.20260408235645@gestion.local
  - owner.test.20260408235645@gestion.local
  - tenant.test.20260408235645@gestion.local

### Gouvernance utilisateurs (admin)

- Service auth refactorise en mode DB-first pour les operations de gestion utilisateurs:
  - liste utilisateurs,
  - provisioning,
  - activation,
  - suspension,
  - changement de role.
- Protection ajoutee contre cache de disponibilite Prisma stale (refresh force).

### Frontend et execution locale

- Frontend revalide sur le port 3000 apres nettoyage du processus bloquant.
- Connexion UI confirmee de bout en bout (login -> dashboard).

### Execution pas a pas terminee (Sprint technique)

- Etape 1: mode auth DB-first durci
  - Auth et gestion utilisateurs executes en priorite sur Supabase.
  - Gestion des statuts/tokens d'activation persistee en base.
- Etape 2: persistance des etats des lieux
  - Nouveaux modeles Prisma Inspection + InspectionPhoto deployes.
  - Creation/lecture/signature/photos validates avec persistance apres redemarrage API.
- Etape 3: fiabilite release
  - Release-check execute avec succes (build web/api + tests API verts).
  - Resultat final tests API: 3 suites / 16 tests passants.

## Plan de travail (suite logique immediate)

### Priorite A - Finaliser le mode Supabase strict

- Supprimer progressivement la dependance au fichier local pour la gestion des comptes.
- Conserver un fallback explicitement limite au mode maintenance/urgence.
- Ajouter un indicateur technique "source des donnees auth" en administration.

### Priorite B - Persistance complete des etats des lieux

- Migrer les inspections/signatures/photos vers des modeles Prisma (au lieu du mode memoire).
- Garantir la persistance apres redemarrage API.
- Ajouter un historique minimal des signatures (date, signataire, hash du contenu).

### Priorite C - Contrat de fiabilite release

- Executer un check de release unique (build web+api, tests API, smoke tests login/roles).
- Documenter le runbook de verification post-deploiement (5-10 checks).
