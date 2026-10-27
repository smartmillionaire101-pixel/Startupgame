/** On-the-job tasks (the feedback round): performance, tasks, results, warnings, let go. */
export const jobTasks: Record<string, string> = {
  // Performance.
  'Performance this month': 'Performance du mois',
  'Meets the bar': 'Au niveau',
  'Needs work': 'À améliorer',
  'Task {n}': 'Tâche {n}',
  'Task {n} missed': 'Tâche {n} manquée',
  '{right} of {done} right · {total} tasks a month':
    '{right} sur {done} justes · {total} tâches par mois',
  'Strikes: {n} of {max}. A wrong call is a strike; three and you’re let go.':
    'Avertissements : {n} sur {max}. Une mauvaise décision compte comme un avertissement ; au troisième, vous êtes renvoyé.',
  '{total} tasks a month': '{total} tâches par mois',
  // The task.
  'Task {n} · {h}h · from {manager}': 'Tâche {n} · {h} h · de {manager}',
  'A task takes {h}h; you have none left this month':
    'Une tâche prend {h} h ; il ne vous en reste plus ce mois-ci',
  'Send answer': 'Envoyer la réponse',
  'No task waiting: your manager will send more next month.':
    'Aucune tâche en attente : votre manager en enverra d’autres le mois prochain.',
  'Good call.': 'Bien vu.',
  'Not quite.': 'Pas tout à fait.',
  'You’ve been let go.': 'Vous avez été renvoyé.',
  // The result.
  'Good call': 'Bien vu',
  'Not quite': 'Pas tout à fait',
  '{delta} performance': '{delta} de performance',
  'You said: {answer}': 'Votre réponse : {answer}',
  'Best: {answer}': 'Meilleure réponse : {answer}',
  'Why:': 'Pourquoi :',
  // Warnings.
  'Final warning': 'Dernier avertissement',
  'Manager warning': 'Avertissement du manager',
  'from {manager}': 'de {manager}',
  'Two strikes — final warning. One more and you’re let go.':
    'Deux avertissements — dernier avertissement. Encore un et vous êtes renvoyé.',
  'One strike — a warning. Three and you’re let go.':
    'Un avertissement. Au troisième, vous êtes renvoyé.',
  'Get every task right for a month to clear a strike. Unanswered tasks count against you.':
    'Un mois sans faute efface un avertissement. Les tâches sans réponse comptent contre vous.',
  // Let go.
  'You’ve been let go': 'Vous avez été renvoyé',
  '{employer} ended your job as {role} after three strikes.':
    '{employer} a mis fin à votre poste de {role} après trois avertissements.',
  'Notice pay (two weeks, before tax)': 'Indemnité de préavis (deux semaines, avant impôt)',
  Stopped: 'Arrêté',
  'On your record': 'Dans votre dossier',
  '“Let go: performance”': '« Renvoyé : performance »',
  'Other employers are hiring: see their ladders below.':
    'D’autres employeurs recrutent : voyez leurs postes ci-dessous.',
  // From the engine (inbox notes and refusals).
  'Manager warning: a strike at work. Three strikes and you’re let go.':
    'Avertissement du manager : un faux pas au travail. Au troisième, vous êtes renvoyé.',
  'Final warning: two strikes at work. One more and you’re let go.':
    'Dernier avertissement : deux faux pas au travail. Encore un et vous êtes renvoyé.',
  'A work task went unanswered last month: it counts as a strike.':
    'Une tâche est restée sans réponse le mois dernier : elle compte comme un avertissement.',
  'Every work task right last month: one strike cleared.':
    'Toutes vos tâches justes le mois dernier : un avertissement effacé.',
  'Three strikes: you’ve been let go.': 'Trois avertissements : vous avez été renvoyé.',
  'There are no work tasks yet.': 'Il n’y a pas encore de tâches au travail.',
  'You don’t have a professional job.': 'Vous n’avez pas d’emploi qualifié.',
  'That task isn’t the one in hand any more.': 'Cette tâche n’est plus celle en cours.',
  'Pick one of the options.': 'Choisissez une des options.',
};
