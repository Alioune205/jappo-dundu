# Jappo Dundu 🩸🚑🏥

**Jappo Dundu** (« Soigner ensemble » en wolof) est une plateforme numérique intégrée de gestion des urgences médicales au Sénégal.
Ce projet de fin d'études vise à interconnecter les établissements de santé, les centres de transfusion sanguine, les services d'ambulances et les citoyens donneurs de sang pour réduire les délais d'intervention et optimiser les ressources.

---

## 🏗️ Architecture du Projet

Le projet est divisé en 3 parties distinctes dans ce dépôt :
1. **`/backend`** : L'API robuste développée avec **Django REST Framework** et **PostgreSQL/PostGIS**.
2. **`/frontend`** : L'interface web pour les hôpitaux développée avec **React**.
3. **`/mobile`** : L'application mobile citoyenne pour les donneurs développée avec **React Native**.

---

## 👥 Équipe & Répartition des Tâches (Dispatching)

> Ce projet est réalisé par 4 étudiants de l'ISEPD (Filière Analyse de Performance Digitale).
> **La règle d'or (API First) :** Le Backend définit le format des réponses (JSON). Le Web et le Mobile peuvent avancer avec de fausses données (mocks) en attendant que l'API soit terminée.

### 👑 & 📱 Pape Alioune Sene — Chef d'équipe & Mobile
*Initialisation de l'architecture et développement de l'interface citoyenne.*
- [x] Initialiser le dépôt GitHub, la structure des dossiers et poser les bases du Backend (Django).
- [ ] Configurer le projet React Native (dans `/mobile`) avec Expo.
- [ ] Développer les 4 écrans (Auth, Profil, Alertes, Historique).
- [ ] Gérer la géolocalisation native et les notifications push (FCM).
- [ ] Mettre en place le stockage local (AsyncStorage) et consommer l'API du backend.

### ⚙️ & 🗄️ Ibrahima Khalilou Diallo — Core Backend & BDD
*Le moteur de l'application et la structuration des données.*
- [ ] Créer et configurer la base de données PostgreSQL/PostGIS locale.
- [ ] Développer la logique métier de l'API (dossier `/backend`) pour les modules `sang`, `lits`, `ambulances`, `users`.
- [ ] Implémenter l'algorithme complexe de recherche géographique (PostGIS) pour trouver les donneurs les plus proches.
- [ ] Structurer la sérialisation des données pour le web et le mobile.

### 💻 Serigne Mbacké Faye — Frontend Web
*L'interface institutionnelle pour les hôpitaux.*
- [ ] Mettre en place le projet React (dans `/frontend`) et le routing.
- [ ] Créer les composants UI partagés (tableaux, boutons, formulaires avec Tailwind).
- [ ] Développer les modules web de gestion.
- [ ] Intégrer les cartes géographiques interactives (Leaflet / Google Maps).
- [ ] Développer le tableau de bord décisionnel (KPI, graphiques) et connecter les WebSockets.

### 🤖 El Hadji Massogui Diop — ML, DevOps & Sécurité
*L'intelligence artificielle, l'infrastructure serveur et la sécurité.*
- [ ] Configurer la sécurité des routes API (JWT, CORS, gestion des rôles).
- [ ] Mettre en place l'infrastructure des WebSockets (Django Channels / Redis).
- [ ] Collecter les données et entraîner le modèle ML de prédiction des pénuries.
- [ ] Gérer le déploiement sur serveur (API/Base) et l'hébergement du Frontend web.
- [ ] Vérifier le système global avant présentation (MVP) via les scénarios de test.

---

## 🚀 Guide de démarrage rapide : Backend

**Ibrahima**, voici les commandes pour démarrer et travailler sur le backend.

### 1. Prérequis
- Avoir installé **Python 3.10+**.
- Avoir installé **PostgreSQL** (et l'extension **PostGIS**).

### 2. Installation de l'environnement
Ouvre un terminal à la racine du projet et tape les commandes suivantes :

```bash
# Se déplacer dans le dossier backend
cd backend

# Créer un environnement virtuel (à ne faire qu'une seule fois)
python -m venv venv

# Activer l'environnement (sous Windows)
.\venv\Scripts\activate

# (Si sous Mac/Linux, utiliser : source venv/bin/activate)

# Installer les dépendances
pip install -r requirements.txt
```

### 3. Configuration locale
1. Copier le fichier `backend/.env.example` et le renommer en `backend/.env`.
2. Ouvrir le fichier `.env` et remplir les informations de connexion à ta base de données locale (PostgreSQL).

### 4. Lancer le serveur
Toujours dans le dossier `backend` avec l'environnement virtuel activé :

```bash
# Appliquer les migrations de la base de données
python manage.py migrate

# Lancer le serveur de développement
python manage.py runserver
```
L'API sera accessible sur `http://127.0.0.1:8000/`.
