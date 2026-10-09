# claude-mods

Mods pour Claude Code.

## usage-band

Un bandeau au-dessus de la zone de saisie qui affiche, en un coup d'œil :

- le modèle, le projet et sa branche git avec son état (`+124 −37`, fichiers non commités, commits `↑` à pousser et `↓` à récupérer), la durée de la session, son coût, les outils appelés et les fichiers modifiés ;
- la place libre dans le contexte et l'utilisation restante sur les fenêtres 5 h et 7 jours (abonnement Pro / Max), avec le temps avant leur reset.

Tout à droite, **Pixel**, une petite mascotte, réagit à la conversation : il réfléchit, écrit du code, lit, lance des commandes, cherche sur le web ou délègue à un sous-agent pendant que Claude travaille ; il est content à la fin d'un tour, sonné après une erreur, fait la fête après un commit, un push ou des tests réussis, fond quand tu dis merci, s'inquiète quand une limite approche et s'endort après 10 minutes sans activité. Passe la souris sur lui et il te fait coucou ; clique dessus et il rigole, saute de joie, s'étonne ou fond, à tour de rôle — et si tu cliques 5 fois de suite, il a la tête qui tourne. Animé dans l'app desktop, en petit visage `(•ᴗ•)` dans le terminal.

Les jauges sont faites de segments qui passent du vert à l'orange puis au rouge : dessinées en SVG dans l'app desktop, en segments texte `▰▰▰▰▰▰▱▱▱▱` dans le terminal.

### Installation

Dans Claude Code :

```
/plugin marketplace add HydrowZer/claude-mods
/plugin install usage-band@claude-mods
```

Puis ouvre une nouvelle session.

### Mettre à jour

Le plugin installé est une copie : il ne suit pas le dépôt tout seul. Pour récupérer la dernière version :

```
claude plugin marketplace update claude-mods
claude plugin update usage-band@claude-mods
```

Puis `/reload-plugins` dans ta session, ou ouvre-en une nouvelle.

### Utilisation

| Commande | Effet |
| --- | --- |
| `/bandeau` | Montre ce qui est affiché ou masqué |
| `/bandeau masquer` / `/bandeau afficher` | Cache ou remet tout le bandeau |
| `/bandeau masquer cout outils` | Cache une ou plusieurs infos |
| `/bandeau afficher etat` | Remet une info (ici l'indicateur « ● en cours ») |
| `/bandeau reset` | Revient aux réglages par défaut |

Infos possibles : `modele`, `projet`, `branche`, `git`, `duree`, `cout`, `outils`, `fichiers`, `etat`, `contexte`, `limites`, `reset`, `mascotte`. Les choix sont gardés d'une session à l'autre.

### Personnaliser

Tout est en haut de [`usage-band/hooks/register.tsx`](usage-band/hooks/register.tsx) : infos affichées par défaut (`DEFAULT_SHOW`), nombre et taille des segments, couleurs, seuils orange et rouge, réglages de Pixel (`SETTINGS`), ce que fait Pixel pour chaque outil (`TOOL_MOODS`) et quand on clique dessus (`POKE_MOODS`). Le dessin de Pixel est dans [`usage-band/hooks/mascot.ts`](usage-band/hooks/mascot.ts).

### Développer

```
claude plugin validate usage-band
claude plugin test usage-band
```
