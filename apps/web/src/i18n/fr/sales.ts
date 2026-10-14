/** Founder Journey 2a: the sales pipeline (screen, phone app and the engine's refusals). */
export const sales: Record<string, string> = {
  // ---- the screen
  'Sales pipeline': 'Pipeline commercial',
  'Win customers one deal at a time': 'Gagnez vos clients une affaire à la fois',
  'Open deals': 'Affaires en cours',
  'Win rate': 'Taux de réussite',
  'Pipeline value': 'Valeur du pipeline',
  'Won customers pay': 'Vos clients gagnés paient',
  'Find new leads': 'Trouver des prospects',
  'Takes {h}h. Finds 1–3 businesses that might buy ({used}/{limit} this month).':
    'Prend {h} h. Trouve 1 à 3 entreprises susceptibles d’acheter ({used}/{limit} ce mois-ci).',
  'You’ve done all your prospecting this month ({n}). Sales staff let you do more.':
    'Vous avez fait toute votre prospection ce mois-ci ({n}). Des commerciaux vous permettraient d’en faire plus.',
  'Your pipeline is full. Close or drop a deal first.':
    'Votre pipeline est plein. Concluez ou abandonnez d’abord une affaire.',
  'Not enough hours left this month.': 'Pas assez d’heures restantes ce mois-ci.',
  'No deals yet. Find leads: local businesses and buyers who might pay for {name}.':
    'Aucune affaire pour l’instant. Trouvez des prospects : commerces locaux et acheteurs prêts à payer pour {name}.',
  'Deals by stage': 'Affaires par étape',
  'The sales pipeline isn’t available yet.': 'Le pipeline commercial n’est pas encore disponible.',
  Closed: 'Terminées',
  'Customers from your pipeline': 'Clients issus de votre pipeline',
  'They’re invoiced every month and pay on 30–90 day terms.':
    'Ils sont facturés chaque mois et paient à 30–90 jours.',
  'New lead: {name}.': 'Nouveau prospect : {name}.',
  '{n} new leads.': '{n} nouveaux prospects.',
  // ---- stages
  Lead: 'Prospect',
  Contacted: 'Contacté',
  Discovery: 'Découverte',
  Demo: 'Démo',
  Proposal: 'Proposition',
  Negotiation: 'Négociation',
  Won: 'Gagnée',
  Lost: 'Perdue',
  // ---- actions
  'Call them': 'Les appeler',
  'Discovery meeting': 'Rendez-vous de découverte',
  'Show a demo': 'Faire une démo',
  'Send a proposal': 'Envoyer une proposition',
  Negotiate: 'Négocier',
  'Ask for the deal': 'Demander la signature',
  'Try again': 'Réessayer',
  'Introduce yourself. They start to trust you.':
    'Présentez-vous. Ils commencent à vous faire confiance.',
  'Ask about their problem: you learn their budget, needs and who decides.':
    'Interrogez-les sur leur problème : vous apprenez leur budget, leurs besoins et qui décide.',
  'Show the product. A good fit and quality win them over.':
    'Montrez le produit. Un bon ajustement et de la qualité les convainquent.',
  'Name your monthly price. Within their budget is safer.':
    'Annoncez votre prix mensuel. Dans leur budget, c’est plus sûr.',
  'Offer a discount: less money each month, a better chance to sign.':
    'Proposez une remise : moins d’argent chaque mois, plus de chances de signer.',
  'Ask them to sign. It can still go either way.':
    'Demandez-leur de signer. Tout peut encore arriver.',
  'One more try: answer their objection and get back to the table.':
    'Une dernière chance : répondez à leur objection et revenez à la table.',
  // ---- loss reasons
  'Too expensive for them': 'Trop cher pour eux',
  'The product doesn’t do what they need yet':
    'Le produit ne fait pas encore ce dont ils ont besoin',
  'Not the right time': 'Pas le bon moment',
  'They don’t trust you enough yet': 'Ils ne vous font pas encore assez confiance',
  'They stayed with a competitor': 'Ils sont restés chez un concurrent',
  'No budget for it': 'Pas de budget pour ça',
  'Try again, then lower the price or offer a discount.':
    'Réessayez, puis baissez le prix ou proposez une remise.',
  'Try again: improve the product and show a new demo.':
    'Réessayez : améliorez le produit et refaites une démo.',
  'Try again: they may be ready a little later.':
    'Réessayez : ils seront peut-être prêts un peu plus tard.',
  'Try again with a reference: trust grows.':
    'Réessayez avec une référence : la confiance grandit.',
  'Try again: beat their current supplier on price or fit.':
    'Réessayez : battez leur fournisseur actuel sur le prix ou l’adéquation.',
  'Try again: get in front of whoever holds the budget.':
    'Réessayez : rencontrez la personne qui tient le budget.',
  'Ran out of time': 'Délai dépassé',
  'Lost: {reason}': 'Perdue : {reason}',
  'This one is gone. Find new leads.': 'Celle-ci est perdue. Trouvez de nouveaux prospects.',
  'Signed: a paying customer.': 'Signé : un client payant.',
  '{name} signed! {amount}/mo from next month.':
    '{name} a signé ! {amount}/mois dès le mois prochain.',
  '{name} said no: {reason}.': '{name} a dit non : {reason}.',
  'You learned what {name} needs.': 'Vous savez maintenant ce dont {name} a besoin.',
  'Deal dropped.': 'Affaire abandonnée.',
  // ---- what you know
  'What you know': 'Ce que vous savez',
  Needs: 'Besoins',
  Budget: 'Budget',
  'Can sign alone': 'Peut signer seul',
  Urgency: 'Urgence',
  'Uses today': 'Utilise aujourd’hui',
  Trust: 'Confiance',
  High: 'Élevée',
  Medium: 'Moyenne',
  Low: 'Faible',
  'A product that fits how they work': 'Un produit adapté à leur façon de travailler',
  'A low price': 'Un prix bas',
  'A brand they trust': 'Une marque de confiance',
  'Something that never breaks': 'Quelque chose qui ne tombe jamais en panne',
  'Nothing yet': 'Rien pour l’instant',
  'Spreadsheets and paper': 'Tableurs et papier',
  'A rival': 'Un concurrent',
  'The big incumbent': 'Le grand acteur en place',
  '{min}–{max}/mo': '{min}–{max}/mois',
  '{n} months to close': '{n} mois pour conclure',
  'Last month to close': 'Dernier mois pour conclure',
  'Chance to win': 'Chances de gagner',
  'Chance to win (a guess until discovery)': 'Chances de gagner (estimation avant la découverte)',
  'Demo went {score}': 'Démo réussie à {score}',
  // ---- confirming a step
  'Monthly price': 'Prix mensuel',
  'Their budget: {min}–{max}/mo': 'Leur budget : {min}–{max}/mois',
  'Your list price is {amount}/mo': 'Votre prix catalogue est de {amount}/mois',
  Discount: 'Remise',
  'Discount: {n}%': 'Remise : {n} %',
  'They’d pay {amount}/mo': 'Ils paieraient {amount}/mois',
  'Takes {h}h and costs {amount}.': 'Prend {h} h et coûte {amount}.',
  'Takes {h}h.': 'Prend {h} h.',
  Confirm: 'Confirmer',
  Drop: 'Abandonner',
  'Drop this deal': 'Abandonner cette affaire',
  // ---- elsewhere
  'Find leads in your Sales pipeline and close a deal':
    'Trouvez des prospects dans votre pipeline commercial et concluez une affaire',

  // ---- the engine's refusals (exact text, via tx())
  'That deal isn’t in your pipeline.': 'Cette affaire n’est pas dans votre pipeline.',
  'Start a company first: you need something to sell.':
    'Créez d’abord une entreprise : il vous faut quelque chose à vendre.',
  'Your company doesn’t have the cash for this right now.':
    'Votre entreprise n’a pas la trésorerie pour ça en ce moment.',
  'You’ve done all your prospecting this month. Hire sales staff to do more, or wait for next month.':
    'Vous avez fait toute votre prospection ce mois-ci. Recrutez des commerciaux pour en faire plus, ou attendez le mois prochain.',
  'No buyers for this product here.': 'Aucun acheteur pour ce produit ici.',
  'That step isn’t possible at this stage of the deal.':
    'Cette étape n’est pas possible à ce stade de l’affaire.',
  'You’ve already tried to win this one back.': 'Vous avez déjà essayé de la récupérer.',
  'This deal ran out of time.': 'Cette affaire a dépassé son délai.',
  'This deal has run out of time.': 'Cette affaire a dépassé son délai.',
  'You don’t have enough hours left this month for that.':
    'Il ne vous reste pas assez d’heures ce mois-ci pour ça.',
  'Name a price above zero.': 'Indiquez un prix supérieur à zéro.',
  'That price isn’t serious.': 'Ce prix n’est pas sérieux.',
  'A discount can be at most 40%.': 'Une remise ne peut pas dépasser 40 %.',
  'They’re tired of haggling. Close the deal or walk away.':
    'Ils en ont assez de marchander. Concluez ou abandonnez.',
  'They already buy from you through a deal you signed.':
    'Ils vous achètent déjà grâce à une affaire que vous avez signée.',
  'This is a customer now, not a deal.': 'C’est un client maintenant, plus une affaire.',
  'Milestone: First customer': 'Étape : premier client',
};
