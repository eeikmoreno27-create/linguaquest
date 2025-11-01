# LinguaQuest

Proyecto listo para subir a GitHub Pages. Email-only Firebase auth optional.

## Setup rápido

1. Copia la carpeta `linguaquest` al repositorio raíz.
2. Si quieres usar Firebase:
   - Crea un proyecto en https://console.firebase.google.com
   - Habilita **Authentication → Sign-in method → Email/Password**
   - Habilita **Firestore** en modo de pruebas (o configura reglas)
   - Copia tu configuración y pégala en `firebase-config.js` (sustituyendo REPLACE_ME)
3. Sube todo a GitHub y activa GitHub Pages (branch main → root).

La app usa `localStorage` por defecto si Firebase no está configurado.
