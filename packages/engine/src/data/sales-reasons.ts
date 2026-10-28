/**
 * Why a customer said no, in their words (round 7, player feedback: "a
 * perfect 100/100 sales conversation can still lose — keep that, but make the
 * reason clear"). One line per reason a deal is lost for (sales.ts
 * SalesLossReason), said by the customer, and filled with what they use today
 * or how long to wait. Engine-side English and French, like
 * ./customer-interviews.ts. Placeholders: {rival} (who they use today),
 * {months} (when to come back).
 */
import type { Line } from './customer-interviews.js';
import type { SalesLossReason } from '../types.js';

const L = (en: string, fr: string): Line => ({ en, fr });

// prettier-ignore
export const LOSS_WORDS: Record<SalesLossReason, Line> = {
  price: L('“It’s more than we pay for this today. I can’t justify it.”', '« C’est plus que ce qu’on paie pour ça aujourd’hui. Je ne peux pas le justifier. »'),
  missing_feature: L('“I liked the talk. But it doesn’t do what we need yet, and I can’t buy a promise.”', '« La discussion m’a plu. Mais ça ne fait pas encore ce dont on a besoin, et je n’achète pas une promesse. »'),
  authority: L('“I’d sign it myself. But it isn’t my decision, and the person who signs hasn’t met you.”', '« Moi, je signerais. Mais ce n’est pas ma décision, et la personne qui signe ne vous a pas rencontré. »'),
  no_budget: L('“There’s no money for this until the next budget. Come back in {months}.”', '« Il n’y a pas d’argent pour ça avant le prochain budget. Revenez dans {months}. »'),
  timing: L('“It matters, just not now. We have other fires. Try me again in {months}.”', '« Ça compte, mais pas maintenant. On a d’autres urgences. Recontactez-moi dans {months}. »'),
  competitor: L('“We’re tied in with {rival}, and switching now costs more than it saves.”', '« On est engagés avec {rival}, et changer maintenant coûterait plus que ça ne rapporte. »'),
  trust: L('“You seem good. But nobody I know uses you yet, and I can’t be your first.”', '« Vous avez l’air bien. Mais personne que je connais ne vous utilise encore, et je ne peux pas être le premier. »'),
  luck: L('“Honestly? It was close. Another week, another mood, and I’d have said yes.”', '« Honnêtement ? C’était serré. Une autre semaine, une autre humeur, et j’aurais dit oui. »'),
};

/** "in 2 months" in the customer's words, both languages. */
export const MONTHS_WORDS = (n: number): Line =>
  n === 1 ? L('a month', 'un mois') : L(`${n} months`, `${n} mois`);
