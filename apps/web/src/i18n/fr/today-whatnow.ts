/** Today per role (a banker's bank) and "What to do now" by time of day. */
export const todayWhatnow: Record<string, string> = {
  // What to do now, by time of day
  'Breakfast at {place}': 'Petit-déjeuner chez {place}',
  'Lunch at {place}': 'Déjeuner chez {place}',
  'Dinner at {place}': 'Dîner chez {place}',
  'Cook at home': 'Cuisiner à la maison',
  'Cheaper than eating out, and good for your health':
    'Moins cher qu’au restaurant, et bon pour la santé',
  'Work out at {place}': 'Faire du sport chez {place}',
  'Health up, stress down: {activity} for {price}':
    'Plus de santé, moins de stress : {activity} pour {price}',
  'Open up at {bank}': 'Ouvrir {bank}',
  'Loan requests and clients are waiting': 'Des demandes de prêt et des clients vous attendent',
  'Your banking licence is the next step': 'Votre licence bancaire est la prochaine étape',
  'Meet founders at the Hub': 'Rencontrer des fondateurs au Hub',
  'Deal flow: founders pitch over coffee':
    'Flux d’affaires : des fondateurs pitchent autour d’un café',
  'Start the day at {company}': 'Commencer la journée chez {company}',
  'Plan the day with your team': 'Planifiez la journée avec votre équipe',
  'Shop at {place}': 'Faire du shopping à {place}',
  'A round of golf at {place}': 'Un parcours de golf à {place}',
  'Fresh air: stress comes down': 'Un bol d’air : le stress baisse',
  'Deals get done on the course': 'Les affaires se concluent sur le parcours',
  'Catch a film at {place}': 'Voir un film chez {place}',
  'Drinks at {place}': 'Un verre chez {place}',
  'Unwind at {place}': 'Se détendre chez {place}',
  'Stress comes down: {activity} for {price}': 'Le stress baisse : {activity} pour {price}',
  'Walk up to {place}': 'Monter à pied jusqu’à {place}',
  'Clear your head: stress comes down': 'Se vider la tête : le stress baisse',
  'Watch the sunset from {place}': 'Admirer le coucher de soleil depuis {place}',
  'Go home and sleep': 'Rentrer dormir',
  'Energy back up for tomorrow': 'De l’énergie pour demain',
  Morning: 'Matin',
  Day: 'Journée',
  Evening: 'Soir',
  'By time of day': 'Selon l’heure',
  'by time of day': 'selon l’heure',
  '{hours} · now': '{hours} · maintenant',
  'Right now (morning):': 'Maintenant (matin) :',
  'Right now (day):': 'Maintenant (journée) :',
  'Right now (evening):': 'Maintenant (soir) :',
  'Right now (night):': 'Maintenant (nuit) :',

  // Today for a banker: start your bank
  'Start your bank': 'Créez votre banque',
  'Steps to your licence': 'Les étapes vers votre licence',
  'Name & licence type': 'Nom et type de licence',
  Shareholders: 'Actionnaires',
  'Sign & file': 'Signer et déposer',
  'Compare their offers on the Bank tab, then sign and file':
    'Comparez leurs offres dans l’onglet Banque, puis signez et déposez le dossier',
  'The fit-and-proper interview: capital, risk, money laundering, governance':
    'L’entretien d’honorabilité : capital, risques, blanchiment, gouvernance',
  'Next on the licence checklist, on the Bank tab':
    'Prochaine étape de la liste de la licence, dans l’onglet Banque',
  'Wait for the Central Bank’s decision': 'Attendre la décision de la Banque centrale',
  'It decides at the end of month {month}': 'Elle décide à la fin du mois {month}',
  'The Central Bank decides at the end of month {month}. Finish the checklist first or the review starts again.':
    'La Banque centrale décide à la fin du mois {month}. Terminez d’abord la liste, sinon l’examen recommence.',
  '{done} of {total} done': '{done} sur {total} faits',
  'Investor groups have made their offers: compare them, negotiate, then sign and file for your licence.':
    'Des groupes d’investisseurs ont fait leurs offres : comparez-les, négociez, puis signez et déposez votre demande de licence.',
  'Name your bank, pick a licence and put in some of your own money. Investor groups offer the rest, then the Central Bank reviews your application.':
    'Nommez votre banque, choisissez une licence et apportez une partie de votre argent. Des groupes d’investisseurs proposent le reste, puis la Banque centrale examine votre demande.',
  'Next step': 'Prochaine étape',
  'While you wait': 'En attendant',
  'The advisory desk is open now': 'Le bureau de conseil est ouvert',
  'Earn fees before the bank opens': 'Gagnez des commissions avant l’ouverture de la banque',

  // Today for a banker: a licensed bank
  '1 loan request': '1 demande de prêt',
  '1 advisory mandate': '1 mandat de conseil',
  '1 late borrower': '1 emprunteur en retard',
  '{n} loan requests': '{n} demandes de prêt',
  '{amount} in total': '{amount} au total',
  '{n} advisory mandates': '{n} mandats de conseil',
  '{n} late borrowers': '{n} emprunteurs en retard',
  '{amount} · call or restructure': '{amount} · relancer ou restructurer',
  'Bring your capital ratio up': 'Remontez votre ratio de capital',
  'Lend less or keep profit in the bank until it is well above {min}':
    'Prêtez moins ou gardez les bénéfices dans la banque jusqu’à être bien au-dessus de {min}',
  'Answer the loan requests': 'Répondre aux demandes de prêt',
  'Borrowers are waiting for a yes or a no': 'Des emprunteurs attendent un oui ou un non',
  'Chase your late borrowers': 'Relancer les emprunteurs en retard',
  'Two missed payments in a row is a default': 'Deux échéances manquées d’affilée, c’est un défaut',
  'Work on your mandates': 'Avancer sur vos mandats',
  'Each one you finish earns a fee': 'Chaque mandat terminé rapporte une commission',
  'Win more depositors': 'Gagner plus de déposants',
  'A better savings rate brings customers, and money to lend':
    'Un meilleur taux d’épargne attire des clients, et de l’argent à prêter',
  '{pct} late': '{pct} en retard',
  'None late': 'Aucun retard',
  'Minimum {pct}': 'Minimum {pct}',
  'last month': 'le mois dernier',
  'Capital is below the minimum': 'Le capital est sous le minimum',
  'Capital is thin': 'Le capital est juste',
  '{ratio} is under the {min} minimum: the Central Bank stops you lending until it is back up.':
    '{ratio}, c’est sous le minimum de {min} : la Banque centrale bloque vos prêts jusqu’à ce qu’il remonte.',
  '{ratio} is close to the {min} minimum. A few more big loans and the Central Bank stops you lending.':
    '{ratio}, c’est proche du minimum de {min}. Encore quelques gros prêts et la Banque centrale bloque vos prêts.',
  '{pct} min': '{pct} min',
  'Waiting for you': 'Ce qui vous attend',
  'Lending rate / savings rate': 'Taux de prêt / taux d’épargne',
};
