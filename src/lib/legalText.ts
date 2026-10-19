import { SUPPORT_EMAIL } from './config';

export type LegalDoc = { title: string; updated: string; sections: { h: string; p: string[] }[] };

const contact = SUPPORT_EMAIL || '[adresse e-mail de contact à ajouter]';
const UPDATED = '19 octobre 2026';

export const LEGAL: Record<'privacy' | 'terms', LegalDoc> = {
  privacy: {
    title: 'Politique de confidentialité',
    updated: UPDATED,
    sections: [
      {
        h: 'Qui sommes-nous ?',
        p: [`Vainc est une application de révision entre amis. Pour toute question sur tes données : ${contact}.`],
      },
      {
        h: 'Les données que nous collectons',
        p: [
          'Ton compte : adresse e-mail et mot de passe (le mot de passe est protégé, nous ne pouvons pas le lire), prénom, pseudo et, si tu le choisis, une photo de profil.',
          'Ton activité : tes sessions de travail (sujet, durée, heure), tes to-do, tes partiels, tes objectifs, ta série, tes réglages.',
          'Tes amis et groupes : la liste de tes amis, tes groupes et leurs codes, les invitations, les réactions.',
          'Tes messages : les messages que tu envoies à tes amis.',
          'Ton animal, ton île, tes achats en heures et tes accessoires.',
          'Ton jeton de notification (pour t’envoyer des notifications si tu les acceptes).',
          'Si tu t’abonnes à Vainc+ : l’état de ton abonnement. Le paiement est géré par Apple, nous ne voyons pas ta carte bancaire.',
        ],
      },
      {
        h: 'À quoi servent ces données',
        p: [
          'À faire fonctionner l’application : te connecter, montrer ton temps de travail à tes amis, calculer le classement, afficher ton animal et ton île, t’envoyer les notifications que tu as acceptées.',
          'Nous ne vendons pas tes données. Nous n’utilisons pas de publicité ni de pistage entre applications.',
        ],
      },
      {
        h: 'Ce que voient les autres',
        p: [
          'Tes amis voient ton prénom, ton pseudo, ta photo, si tu es en train de travailler, ton temps de la semaine, ta série, ton animal et ton île. Les membres de tes groupes voient ton prénom et ton temps dans le classement du groupe.',
          'Tes messages ne sont visibles que par toi et la personne à qui tu écris. Tes to-do et tes partiels sont privés, sauf un partiel que tu choisis de partager.',
        ],
      },
      {
        h: 'Qui héberge les données',
        p: [
          'Les données sont stockées chez Supabase (base de données, comptes et fichiers). Les notifications passent par le service de notifications d’Expo puis par Apple. Ces services ne reçoivent que ce qui est nécessaire pour faire fonctionner l’application.',
        ],
      },
      {
        h: 'Combien de temps nous les gardons',
        p: ['Tant que ton compte existe. Quand tu supprimes ton compte, tes données (profil, sessions, messages, amis, animal, île, photo) sont effacées.'],
      },
      {
        h: 'Tes droits',
        p: [
          'Tu peux supprimer ton compte à tout moment dans l’application : Profil → Supprimer mon compte. Tu peux aussi modifier ou retirer ta photo, désactiver les notifications, bloquer ou signaler quelqu’un.',
          `Pour accéder à tes données, les corriger ou demander leur effacement, écris-nous : ${contact}.`,
        ],
      },
      {
        h: 'Âge minimum',
        p: ['Vainc est réservée aux personnes de 13 ans et plus. Si tu as moins de 13 ans, n’utilise pas l’application.'],
      },
      {
        h: 'Changements',
        p: ['Si cette politique change, la date en haut de la page est mise à jour.'],
      },
    ],
  },
  terms: {
    title: 'Conditions d’utilisation',
    updated: UPDATED,
    sections: [
      {
        h: 'Respect des autres',
        p: [
          'Vainc est un endroit pour réviser ensemble. Les insultes, le harcèlement, les contenus sexuels, haineux, violents ou illégaux, l’usurpation d’identité et le spam sont interdits. Nous avons une tolérance zéro pour les contenus choquants et les comportements abusifs.',
          'Les messages, pseudos, noms, libellés de sessions et noms d’animaux passent par un filtre de mots interdits.',
        ],
      },
      {
        h: 'Signaler et bloquer',
        p: [
          'Tu peux signaler une personne ou un message, et bloquer quelqu’un, depuis la conversation. Bloquer met fin à l’amitié : la personne ne peut plus t’écrire ni te redemander en ami.',
          'Nous examinons les signalements. Nous pouvons supprimer un contenu ou un compte qui ne respecte pas ces règles, sans prévenir en cas de contenu grave.',
        ],
      },
      {
        h: 'Ton compte',
        p: [
          'Tu es responsable de ton mot de passe. Tu peux supprimer ton compte à tout moment dans Profil → Supprimer mon compte.',
          'Une session de travail est abandonnée si tu quittes l’application plus de quelques secondes : c’est le principe de l’application et c’est visible par tes amis.',
        ],
      },
      {
        h: 'Vainc+',
        p: [
          'Vainc+ est un abonnement optionnel qui ajoute des avantages (animaux exclusifs, badges, statistiques…). Il est géré par Apple : tu peux le gérer ou l’annuler dans les réglages de ton compte Apple.',
          'Les heures gagnées en travaillant servent à acheter des objets dans l’application. Elles n’ont aucune valeur en argent.',
        ],
      },
      {
        h: 'Contact',
        p: [`Une question, un problème, un contenu à nous signaler : ${contact}.`],
      },
    ],
  },
};
