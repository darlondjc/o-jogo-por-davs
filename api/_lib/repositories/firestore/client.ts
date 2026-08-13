import { type App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { type Firestore, getFirestore } from 'firebase-admin/firestore';

/**
 * Cliente autenticado do Firestore. Credenciais só existem aqui, server-side
 * (Vercel Functions) — nunca chegam ao Angular. Segue o mesmo padrão do
 * cliente do Google Sheets (`../google-sheets/client.ts`): uma função
 * `isFirestoreConfigured()` que o resto do backend consulta pra decidir se
 * usa Firestore ou cai para outro repositório (spec "Melhorias de
 * armazenamento": Firestore é o repositório ao vivo quando configurado; sem
 * as variáveis, o app continua funcionando exatamente como antes).
 */

export function isFirestoreConfigured(): boolean {
  return Boolean(
    process.env['FIREBASE_PROJECT_ID'] &&
      process.env['FIREBASE_CLIENT_EMAIL'] &&
      process.env['FIREBASE_PRIVATE_KEY'],
  );
}

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

let cachedApp: App | null = null;

function getFirebaseApp(): App {
  if (cachedApp) return cachedApp;

  // Em dev com hot-reload/funções reaproveitadas, o SDK pode já ter uma app
  // inicializada — reaproveita em vez de inicializar de novo (o Admin SDK
  // lança erro se `initializeApp` for chamado duas vezes sem nome).
  const existing = getApps();
  if (existing.length) {
    cachedApp = existing[0];
    return cachedApp;
  }

  const projectId = getEnv('FIREBASE_PROJECT_ID');
  const clientEmail = getEnv('FIREBASE_CLIENT_EMAIL');
  const privateKey = getEnv('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n');

  cachedApp = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  return cachedApp;
}

let cachedDb: Firestore | null = null;

export function getFirestoreDb(): Firestore {
  if (cachedDb) return cachedDb;
  cachedDb = getFirestore(getFirebaseApp());
  return cachedDb;
}
