/** Capital → Exit for investors: selling a private stake, or why you can't yet. */
export const capitalExit: Record<string, string> = {
  'Selling private stakes isn’t open in this world yet.':
    'La vente de participations privées n’est pas encore ouverte dans ce monde.',
  'Your {amount} SAFE isn’t shares yet. It turns into shares at {name}’s next priced round; you can sell then.':
    'Votre SAFE de {amount} n’est pas encore converti en actions. Il le sera au prochain tour valorisé de {name} ; vous pourrez vendre à ce moment-là.',
  'There is no share price yet. You can sell after {name} raises a priced round.':
    'Il n’y a pas encore de prix par action. Vous pourrez vendre après un tour valorisé de {name}.',
  'The board won’t consent while {name} is short of runway. You can sell once it has {n} months of runway or a profitable month.':
    'Le conseil refuse tant que {name} manque de trésorerie. Vous pourrez vendre quand elle aura {n} mois de trésorerie ou un mois rentable.',
  // Refusals from the game server (shown through tx()).
  'Only an AI fund or angel already on the cap table buys this way.':
    'Seuls un fonds IA ou un business angel déjà au capital achètent ainsi.',
  'That is less than one share.': 'C’est moins d’une action.',
  'Too small to sell.': 'Trop petit pour être vendu.',
  'There is no share price yet.': 'Il n’y a pas encore de prix par action.',
  'Sell listed shares on the exchange.': 'Vendez les actions cotées en Bourse.',
  'Founders sell through Capital → Exit.': 'Les fondateurs vendent via Capital → Sortie.',
  'Can’t sell yet': 'Vente impossible pour l’instant',
  'You own {pct} ({n} shares), worth {value} on paper. You put in {cost}.':
    'Vous détenez {pct} ({n} actions), soit {value} sur le papier. Vous avez investi {cost}.',
  'You put in {cost}.': 'Vous avez investi {cost}.',
  'A secondary fund: always there, {d} under the last round price.':
    'Un fonds secondaire : toujours preneur, à {d} sous le prix du dernier tour.',
  'Already on the cap table: pays {d} under the last round price.':
    'Déjà au capital : paie {d} sous le prix du dernier tour.',
  'Buyer pays': 'L’acheteur paie',
  'You sell': 'Vous vendez',
  'What it cost you': 'Ce que cela vous a coûté',
  '{n} shares and {safe} of SAFE': '{n} actions et {safe} de SAFE',
  '{safe} of SAFE': '{safe} de SAFE',
  '{n} shares': '{n} actions',
  '{amount} of it is a SAFE: it becomes shares at the next priced round.':
    'Dont {amount} en SAFE : il devient des actions au prochain tour valorisé.',
  Gain: 'Plus-value',
  Loss: 'Moins-value',
  '{name} can’t pay that much right now. Sell less, or pick another buyer.':
    '{name} ne peut pas payer autant pour l’instant. Vendez moins, ou choisissez un autre acheteur.',
  'Sell {what} of {name} to {buyer} for {gross}? You get {net} after tax. This can’t be undone.':
    'Vendre {what} de {name} à {buyer} pour {gross} ? Vous recevez {net} après impôt. C’est définitif.',
  'Sold {what} of {name}: {net} is in your account.':
    'Vendu {what} de {name} : {net} est sur votre compte.',
  'Confirm sale': 'Confirmer la vente',
  'Sell all of my stake…': 'Vendre toute ma participation…',
  'Sell {pct} of my stake…': 'Vendre {pct} de ma participation…',
  'Your stakes in private companies': 'Vos participations dans des entreprises privées',
  'Sell some or all of a stake to a secondary buyer':
    'Vendez tout ou partie d’une participation à un acheteur secondaire',
  'Private shares have no market price. A secondary buyer pays below the last round price; the company gets nothing and nobody is diluted. A gain over what you paid is taxed.':
    'Les actions privées n’ont pas de prix de marché. Un acheteur secondaire paie moins que le prix du dernier tour ; l’entreprise ne reçoit rien et personne n’est dilué. La plus-value sur votre mise est imposée.',
  Realised: 'Réalisé',
  'You sold {what} of {name} for {price}. It cost you {cost}: {result}. Tax {tax}; {net} is in your account.':
    'Vous avez vendu {what} de {name} pour {price}. Cela vous avait coûté {cost} : {result}. Impôt {tax} ; {net} est sur votre compte.',
  'a gain of {n}': 'une plus-value de {n}',
  'a loss of {n}': 'une moins-value de {n}',
  'Nothing to sell yet. Companies you found, and private companies you back as an investor, show here.':
    'Rien à vendre pour l’instant. Les entreprises que vous fondez, et les entreprises privées que vous financez comme investisseur, apparaissent ici.',
  'Private: sell in Capital → Exit': 'Privé : vendez dans Capital → Sortie',
  'To sell a stake before the company exits, open Capital → Exit.':
    'Pour vendre une participation avant la sortie de l’entreprise, ouvrez Capital → Sortie.',
};
