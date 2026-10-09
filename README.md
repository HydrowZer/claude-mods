# claude-mods

Mods pour Claude Code.

## usage-band

Un bandeau au-dessus de la zone de saisie qui affiche, en un coup d'œil :

- le modèle, le projet et sa branche git, la durée de la session, son coût, les outils appelés et les fichiers modifiés ;
- la place libre dans le contexte et l'utilisation restante sur les fenêtres 5 h et 7 jours (abonnement Pro / Max), avec le temps avant leur reset.

Les jauges sont faites de segments qui passent du vert à l'orange puis au rouge : dessinées en SVG dans l'app desktop, en segments texte `▰▰▰▰▰▰▱▱▱▱` dans le terminal.

### Installation

Dans Claude Code :

```
/plugin marketplace add HydrowZer/claude-mods
/plugin install usage-band@claude-mods
```

Puis ouvre une nouvelle session.

### Utilisation

| Commande | Effet |
| --- | --- |
| `/bandeau` | Montre ce qui est affiché ou masqué |
| `/bandeau masquer` / `/bandeau afficher` | Cache ou remet tout le bandeau |
| `/bandeau masquer cout outils` | Cache une ou plusieurs infos |
| `/bandeau afficher etat` | Remet une info (ici l'indicateur « ● en cours ») |
| `/bandeau reset` | Revient aux réglages par défaut |

Infos possibles : `modele`, `projet`, `branche`, `duree`, `cout`, `outils`, `fichiers`, `etat`, `contexte`, `limites`, `reset`. Les choix sont gardés d'une session à l'autre.

### Personnaliser

Tout est en haut de [`usage-band/hooks/register.tsx`](usage-band/hooks/register.tsx) : infos affichées par défaut (`DEFAULT_SHOW`), nombre et taille des segments, couleurs, seuils orange et rouge (`SETTINGS`).

### Développer

```
claude plugin validate usage-band
claude plugin test usage-band
```
