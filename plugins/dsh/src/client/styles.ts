/**
 * The page's and the chat cards' CSS, after Artifacts page and its comment cards. It reads the app's own
 * design tokens (`--dsw-alias-*`), so the page follows the app's theme, light or dark (`body[data-ds-dark-theme]`).
 * Every class starts with `oa-` (the page) or `oac-` (the cards): nothing here reaches the app around them.
 */

/** The Open Artifact page. */
export const PAGE_CSS = `
.oa-page{position:relative;width:100%;min-width:0;height:100%;min-height:0;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font-size:14px;line-height:1.6;display:flex;flex-direction:column;overflow:hidden}
.oa-scroll{flex:1;min-height:0;overflow:auto;scrollbar-gutter:stable}
.oa-content{max-width:1120px;margin:0 auto;padding:0 clamp(24px,4vw,48px) 56px}
.oa-heading{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px 16px;padding-top:28px;margin-bottom:24px}
[data-platform=darwin] .oa-heading{padding-top:calc(28px + var(--dsh-frame-top-clearance,0px))}
.oa-heading h1{margin:0;font-size:20px;font-weight:500;line-height:28px}
.oa-tools{display:flex;align-items:center;gap:4px;margin-left:auto}
.oa-tool{position:relative;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;border:0;border-radius:8px;background:none;color:var(--dsw-alias-label-secondary);cursor:pointer}
.oa-tool:hover,.oa-tool[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.oa-tool[data-active=true]::after{content:"";position:absolute;top:6px;right:6px;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-business-primary)}
.oa-search{display:flex;align-items:center;gap:6px;width:min(240px,50vw);height:32px;padding:0 8px 0 10px;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;color:var(--dsw-alias-label-tertiary)}
.oa-search:focus-within{border-color:var(--dsw-alias-state-business-primary)}
.oa-search input{flex:1;min-width:0;height:100%;border:0;padding:0;background:none;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;outline:none}
.oa-search input::placeholder{color:var(--dsw-alias-label-caption)}
.oa-search input::-webkit-search-cancel-button{display:none}
.oa-search button{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;margin-right:-4px;padding:0;border:0;border-radius:6px;background:none;color:inherit;cursor:pointer}
.oa-search button:hover{background:var(--dsw-alias-interactive-bg-hover)}
.oa-section-title{margin:0 0 12px;font-size:13px;font-weight:400;line-height:20px;color:var(--dsw-alias-label-tertiary)}
.oa-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:14px 10px;margin:0 0 36px;padding:0;list-style:none}
.oa-tile{display:flex;flex-direction:column;gap:8px;width:100%;padding:0;border:0;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}
.oa-tile-art{position:relative;display:flex;align-items:center;justify-content:center;aspect-ratio:10/7;border-radius:14px;overflow:hidden;background:var(--oa-wash);color:var(--oa-ink);transition:transform .2s cubic-bezier(.2,.7,.3,1),background-color .15s}
.oa-tile:hover .oa-tile-art,.oa-tile[data-peek=true] .oa-tile-art{transform:scale(1.03)}
.oa-tile:focus-visible{outline:none}
.oa-tile:focus-visible .oa-tile-art{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.oa-tile-art>svg{position:relative}
.oa-tile-art>.oa-tile-doodle{position:absolute;inset:0;width:100%;height:100%;opacity:.14;pointer-events:none}
.oa-tile-beta{position:absolute;top:6px;left:6px;padding:0 6px;border-radius:999px;background:#fff;box-shadow:0 0 0 .5px var(--dsw-alias-border-l4,rgba(0,0,0,.16));color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px}
.oa-tile-label{display:flex;flex-direction:column;padding-left:2px;font-size:14px;line-height:20px}
.oa-tile-state{display:inline-flex;align-items:center;gap:5px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:16px}
.oa-tile-state[data-state=failed]{color:var(--dsw-alias-state-error-primary)}
.oa-tile-state .oa-spinner{width:9px;height:9px;border-width:1.2px}
.oa-tile[data-missing=true] .oa-tile-art{background:color-mix(in srgb,var(--oa-wash) 45%,var(--dsw-alias-bg-base));color:color-mix(in srgb,var(--oa-ink) 55%,var(--dsw-alias-bg-base));box-shadow:inset 0 0 0 .5px color-mix(in srgb,var(--oa-ink) 22%,transparent)}
.oa-tile[data-missing=true]:hover .oa-tile-art,.oa-tile[data-missing=true][data-peek=true] .oa-tile-art{background:color-mix(in srgb,var(--oa-wash) 65%,var(--dsw-alias-bg-base))}
.oa-tile[data-missing=true] .oa-tile-doodle{opacity:.08}
.oa-tile[data-missing=true] .oa-tile-label{color:var(--dsw-alias-label-secondary)}
body[data-ds-dark-theme] .oa-tile-art{background:color-mix(in srgb,var(--oa-ink) 36%,var(--dsw-alias-bg-base));color:var(--oa-wash)}
body[data-ds-dark-theme] .oa-tile[data-missing=true] .oa-tile-art{background:color-mix(in srgb,var(--oa-ink) 16%,var(--dsw-alias-bg-base));color:color-mix(in srgb,var(--oa-wash) 55%,var(--dsw-alias-bg-base));box-shadow:inset 0 0 0 .5px color-mix(in srgb,var(--oa-wash) 18%,transparent)}
body[data-ds-dark-theme] .oa-tile[data-missing=true]:hover .oa-tile-art,body[data-ds-dark-theme] .oa-tile[data-missing=true][data-peek=true] .oa-tile-art{background:color-mix(in srgb,var(--oa-ink) 24%,var(--dsw-alias-bg-base))}
body[data-ds-dark-theme] .oa-tile-art>.oa-tile-doodle{opacity:.12}
body[data-ds-dark-theme] .oa-tile-beta{background:var(--dsw-alias-bg-base)}
.oa-peek{position:fixed;z-index:900;width:288px;max-width:calc(100vw - 16px);box-sizing:border-box;padding:16px;border:.5px solid var(--dsw-alias-border-l4,rgba(0,0,0,.16));border-radius:16px;background:var(--dsw-alias-bg-base);box-shadow:0 12px 32px -10px rgba(0,0,0,.22);color:var(--dsw-alias-label-primary);animation:oa-peek-in .14s ease-out}
.oa-peek-title{font-size:17px;line-height:24px}
.oa-peek-by{margin-top:2px;font-size:14px;line-height:20px;color:var(--dsw-alias-label-secondary)}
.oa-peek-about{margin:6px 0 0;font-size:14px;line-height:20px;color:var(--dsw-alias-label-secondary)}
.oa-peek-act{margin-top:14px;height:32px;padding:0 10px;border:0;border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 6%,var(--dsw-alias-bg-base));color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;cursor:pointer}
.oa-peek-act:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 10%,var(--dsw-alias-bg-base))}
.oa-peek-act:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
@keyframes oa-peek-in{from{opacity:0;transform:translateY(-4px)}}
.oa-dialog-head{display:flex;align-items:center;gap:12px;margin-bottom:12px}
.oa-dialog-head h2{margin:0}
.oa-dialog .oa-glyph{width:40px;height:40px}
.oa-dialog p+p{margin-top:8px}
.oa-dialog p[data-kind=error]{color:var(--dsw-alias-state-error-primary)}
.oa-dialog-status{display:flex;align-items:center;gap:8px}
.oa-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:20px;margin:0;padding:0;list-style:none}
.oa-item{position:relative;min-width:0}
.oa-card{display:flex;flex-direction:column;width:100%;padding:0;border:.5px solid var(--dsw-alias-border-l2);border-radius:14px;overflow:hidden;background:var(--dsw-alias-bg-base);color:inherit;font:inherit;text-align:left;cursor:pointer;transition:background-color .15s}
.oa-item:hover .oa-card{background:var(--dsw-alias-interactive-bg-hover)}
.oa-card:disabled{cursor:progress}
.oa-card:focus-visible,.oa-row:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.oa-preview{position:relative;display:block;width:100%;aspect-ratio:2/1;overflow:hidden;background:color-mix(in srgb,var(--oa-tint) 16%,var(--dsw-alias-bg-base))}
.oa-sheet{position:absolute;left:12%;right:12%;top:13%;bottom:-8px;border-radius:8px 8px 0 0;overflow:hidden;background:var(--dsw-alias-bg-base);box-shadow:0 0 0 .5px var(--dsw-alias-border-l2),0 6px 18px -8px rgba(0,0,0,.28);transition:transform .2s}
.oa-item:hover .oa-sheet{transform:translateY(-3px)}
.oa-sheet img{display:block;width:100%;height:100%;object-fit:cover;object-position:top center;user-select:none}
.oa-preview[data-stack=true] .oa-sheet{left:20%;right:20%}
.oa-preview[data-stack=true]::before{content:"";position:absolute;left:21%;right:19%;top:10%;bottom:-8px;border-radius:8px 8px 0 0;background:var(--dsw-alias-bg-base);box-shadow:0 0 0 .5px var(--dsw-alias-border-l2);transform:rotate(1.6deg);transform-origin:bottom center}
.oa-paper{position:absolute;left:14%;right:14%;top:13%;bottom:-8px;border-radius:8px 8px 0 0;background:var(--dsw-alias-bg-base);box-shadow:0 0 0 .5px var(--dsw-alias-border-l2),0 6px 18px -8px rgba(0,0,0,.25);padding:6% 7% 0;display:flex;flex-direction:column;gap:6px;overflow:hidden;transition:transform .2s}
.oa-item:hover .oa-paper{transform:translateY(-3px)}
.oa-paper-title{font-size:11px;line-height:1.35;font-weight:600;color:var(--dsw-alias-label-primary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.oa-line{height:5px;border-radius:3px;background:var(--dsw-alias-border-l2)}
.oa-slide{position:absolute;left:14%;right:14%;top:13%;aspect-ratio:16/9;border-radius:6px;background:var(--dsw-alias-bg-base);box-shadow:0 0 0 .5px var(--dsw-alias-border-l2),0 6px 18px -8px rgba(0,0,0,.25);display:flex;flex-direction:column;justify-content:center;gap:6px;padding:0 9%;transition:transform .2s}
.oa-item:hover .oa-slide{transform:translateY(-3px)}
.oa-slide .oa-paper-title{font-size:12px}
.oa-slide .oa-line{width:40%;background:var(--oa-tint);opacity:.55}
.oa-boards{display:flex;gap:6px;flex:1;margin-top:2px}
.oa-board{flex:1;border-radius:3px;background:color-mix(in srgb,var(--oa-tint) 18%,var(--dsw-alias-bg-base));box-shadow:0 0 0 .5px var(--dsw-alias-border-l2)}
.oa-board:nth-child(2){flex:.7;margin-top:10%}
.oa-flow{display:block;width:100%;height:auto;margin-top:4px}
.oa-flow rect{fill:color-mix(in srgb,var(--oa-tint) 18%,var(--dsw-alias-bg-base));stroke:var(--dsw-alias-border-l2);stroke-width:.5}
.oa-flow path{fill:none;stroke:var(--oa-tint);stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round}
.oa-cells{display:block;width:100%;height:auto;margin-top:4px}
.oa-cells path{fill:none;stroke:var(--dsw-alias-border-l2);stroke-width:.75}
.oa-cells-head{fill:color-mix(in srgb,var(--oa-tint) 18%,var(--dsw-alias-bg-base))}
.oa-cells-pick{fill:none;stroke:var(--oa-tint);stroke-width:1.5}
.oa-swatches{display:flex;gap:4px}
.oa-swatch{width:16px;height:16px;border-radius:50%;background:var(--oa-tint)}
.oa-swatch:nth-child(2){opacity:.7}.oa-swatch:nth-child(3){opacity:.45}.oa-swatch:nth-child(4){opacity:.25}
.oa-specimen{font-size:20px;line-height:1;font-weight:600;color:var(--dsw-alias-label-secondary)}
.oa-kpis{display:flex;gap:5px}
.oa-kpi{flex:1;height:16px;border-radius:3px;box-shadow:0 0 0 .5px var(--dsw-alias-border-l2)}
.oa-bars{display:flex;align-items:flex-end;gap:5px;height:34%;margin-top:2px}
.oa-bar{flex:1;border-radius:2px 2px 0 0;background:var(--oa-tint);opacity:.7}
.oa-film{position:absolute;left:14%;right:14%;top:13%;aspect-ratio:16/9;border-radius:6px;background:#1d1d1f;box-shadow:0 6px 18px -8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;transition:transform .2s;color:#fff}
.oa-item:hover .oa-film{transform:translateY(-3px)}
.oa-film-bar{position:absolute;left:8%;right:8%;bottom:10%;height:3px;border-radius:2px;background:rgba(255,255,255,.25)}
.oa-film-bar::after{content:"";position:absolute;left:0;top:0;bottom:0;width:38%;border-radius:2px;background:var(--oa-tint)}
.oa-film-title{position:absolute;left:8%;right:8%;top:10%;font-size:10px;font-weight:600;color:rgba(255,255,255,.85);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.oa-busy{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:8px;background:color-mix(in srgb,var(--dsw-alias-bg-base) 70%,transparent);color:var(--dsw-alias-label-secondary);font-size:13px}
.oa-spinner{width:14px;height:14px;border-radius:50%;border:1.5px solid currentColor;border-right-color:transparent;animation:oa-spin .8s linear infinite}
@keyframes oa-spin{to{transform:rotate(360deg)}}
.oa-info{display:flex;align-items:center;gap:12px;min-width:0;padding:12px 14px}
.oa-glyph{flex:none;display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:9px;background:var(--oa-wash);color:var(--oa-ink)}
body[data-ds-dark-theme] .oa-glyph{background:color-mix(in srgb,var(--oa-ink) 36%,var(--dsw-alias-bg-base));color:var(--oa-wash)}
.oa-menu-glyph{display:flex;color:var(--oa-ink)}
body[data-ds-dark-theme] .oa-menu-glyph{color:var(--oa-wash)}
.oa-text{display:flex;flex-direction:column;min-width:0;flex:1}
.oa-name{font-weight:500;line-height:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.oa-meta{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.oa-actions{position:absolute;top:10px;right:10px;display:flex;align-items:center;gap:6px}
.oa-act{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;padding:0;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);cursor:pointer;opacity:0;transition:opacity .12s}
.oa-act:hover{color:var(--dsw-alias-label-primary);background:color-mix(in srgb,var(--dsw-alias-label-primary) 6%,var(--dsw-alias-bg-base))}
.oa-item:hover .oa-act,.oa-item:focus-within .oa-act,.oa-act[aria-expanded=true],.oa-act[data-on=true]{opacity:1}
.oa-act[data-on=true]{color:var(--dsw-alias-label-primary)}
.oa-list{display:flex;flex-direction:column;gap:2px;margin:0;padding:0;list-style:none}
.oa-list .oa-item{display:flex;align-items:center;border-radius:10px;padding-right:8px}
.oa-list .oa-item:hover,.oa-list .oa-item[data-menu=true]{background:var(--dsw-alias-interactive-bg-hover)}
.oa-row{display:flex;align-items:center;gap:12px;flex:1;min-width:0;padding:8px 10px;border:0;border-radius:10px;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}
.oa-row:disabled{cursor:progress}
.oa-row .oa-name{flex:1;min-width:0}
.oa-row .oa-meta{flex:none;margin-left:16px}
.oa-row-tools{flex:none;display:flex;align-items:center;gap:2px;margin-left:4px;color:var(--dsw-alias-label-tertiary)}
.oa-shared{display:inline-flex;align-items:center;margin-right:6px;color:var(--dsw-alias-label-tertiary)}
.oa-list .oa-act{width:28px;height:28px;border:0;background:none}
.oa-list .oa-act:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent)}
.oa-list .oa-act-more{opacity:1}
@media (max-width:560px){.oa-row .oa-meta{display:none}}
.oa-menu{position:fixed;z-index:1000;min-width:200px;padding:6px;border:.5px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-base);box-shadow:0 8px 28px -6px rgba(0,0,0,.28);font-size:14px}
.oa-menu-item{display:flex;align-items:center;gap:10px;width:100%;min-height:34px;padding:5px 10px;border:0;border-radius:8px;background:none;color:var(--dsw-alias-label-primary);font:inherit;text-align:left;white-space:nowrap;cursor:pointer}
.oa-menu-item:hover,.oa-menu-item:focus-visible,.oa-menu-item[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);outline:none}
.oa-menu-item[data-danger=true]{color:var(--dsw-alias-state-error-primary)}
.oa-menu-item svg{flex:none}
.oa-menu-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.oa-menu-value{margin-left:16px;color:var(--dsw-alias-label-tertiary)}
.oa-menu-count{margin-left:16px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.oa-menu-key{margin-left:20px;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:12px}
.oa-menu-rule{height:.5px;margin:6px 4px;background:var(--dsw-alias-border-l2)}
.oa-menu-chev{margin-left:6px;color:var(--dsw-alias-label-tertiary)}
.oa-menu-row{position:relative}
.oa-submenu{position:absolute;left:calc(100% + 12px);top:-6px;z-index:1001;min-width:190px;padding:6px;border:.5px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-base);box-shadow:0 8px 28px -6px rgba(0,0,0,.28)}
.oa-submenu[data-flip=true]{left:auto;right:calc(100% + 12px)}
.oa-check{flex:none;display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;color:transparent}
.oa-check[data-on=true]{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-primary);color:#fff}
.oa-tick{flex:none;margin-left:16px;color:var(--dsw-alias-state-business-primary)}
.oa-scrim{position:fixed;inset:0;z-index:1100;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,.36)}
.oa-dialog{width:min(420px,100%);padding:20px;border-radius:16px;background:var(--dsw-alias-bg-base);box-shadow:0 18px 48px -12px rgba(0,0,0,.4)}
.oa-dialog h2{margin:0 0 12px;font-size:16px;font-weight:600;line-height:24px;overflow-wrap:anywhere}
.oa-dialog p{margin:0;color:var(--dsw-alias-label-secondary);font-size:14px;line-height:1.55;overflow-wrap:anywhere}
.oa-dialog input{box-sizing:border-box;width:100%;height:38px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:none;color:var(--dsw-alias-label-primary);font:inherit;outline:none}
.oa-dialog input:focus{border-color:var(--dsw-alias-state-business-primary)}
.oa-dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}
.oa-btn{height:34px;padding:0 14px;border:0;border-radius:9px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);font:inherit;font-weight:500;cursor:pointer}
.oa-btn:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 12%,var(--dsw-alias-bg-base))}
.oa-btn:disabled{color:var(--dsw-alias-label-caption);cursor:default;background:var(--dsw-alias-interactive-bg-hover)}
.oa-btn[data-primary=true]{background:var(--dsw-alias-state-business-primary);color:#fff}
.oa-btn[data-primary=true]:hover:not(:disabled){filter:brightness(1.08)}
.oa-btn[data-primary=true]:disabled{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-caption)}
.oa-btn[data-danger=true]{border:1px solid var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,var(--dsw-alias-bg-base));color:var(--dsw-alias-state-error-primary)}
.oa-btn[data-danger=true]:hover{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 18%,var(--dsw-alias-bg-base))}
.oa-toast{position:absolute;left:50%;bottom:24px;z-index:900;display:flex;align-items:center;gap:10px;max-width:min(560px,calc(100% - 32px));padding:9px 10px 9px 14px;border:.5px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-base);box-shadow:0 8px 28px -6px rgba(0,0,0,.28);transform:translateX(-50%);font-size:14px}
.oa-toast[data-kind=error]{color:var(--dsw-alias-state-error-primary)}
.oa-toast svg{flex:none}
.oa-toast-text{min-width:0;overflow-wrap:anywhere}
.oa-toast-undo{flex:none;padding:2px 8px;border:0;border-radius:6px;background:none;color:var(--dsw-alias-state-business-primary);font:inherit;font-weight:500;cursor:pointer}
.oa-toast-undo:hover{background:var(--dsw-alias-interactive-bg-hover)}
.oa-toast-close{flex:none;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:0;border-radius:6px;background:none;color:var(--dsw-alias-label-tertiary);cursor:pointer}
.oa-toast-close:hover{background:var(--dsw-alias-interactive-bg-hover)}
.oa-empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:56px 20px;text-align:center;color:var(--dsw-alias-label-tertiary)}
.oa-empty svg{color:var(--dsw-alias-label-caption);margin-bottom:4px}
.oa-empty h2{margin:0;font-size:14px;font-weight:500;color:var(--dsw-alias-label-secondary)}
.oa-empty p{margin:0;max-width:420px;font-size:13px;line-height:1.6}
.oa-retry{margin-top:8px;height:30px;padding:0 12px;border:.5px solid var(--dsw-alias-border-l2);border-radius:15px;background:none;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;cursor:pointer}
.oa-retry:hover{background:var(--dsw-alias-interactive-bg-hover)}
.oa-skeleton .oa-card{cursor:default}
.oa-skeleton .oa-preview{background:var(--dsw-alias-bg-skeleton,var(--dsw-alias-interactive-bg-hover))}
.oa-skeleton .oa-line{width:60%;height:10px;margin:18px 14px}
@media (prefers-reduced-motion:reduce){.oa-sheet,.oa-paper,.oa-slide,.oa-film,.oa-act,.oa-tile-art,.oa-card{transition:none}.oa-tile:hover .oa-tile-art,.oa-tile[data-peek=true] .oa-tile-art{transform:none}.oa-peek{animation:none}.oa-spinner{animation-duration:2s}}
.oa-news .oau-head{margin-bottom:8px}
.oa-notes{display:flex;flex-direction:column;gap:12px;align-items:flex-start}
.oa-release{align-self:stretch;min-width:0}
.oa-release-head{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;margin:0 0 4px;font-size:14px;font-weight:600;line-height:22px;color:var(--dsw-alias-label-primary)}
.oa-release-date{font-weight:400;color:var(--dsw-alias-label-tertiary);font-size:12px}
.oa-release-summary{margin:0 0 6px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;overflow-wrap:anywhere}
.oa-release-section{margin-top:6px}
.oa-release-section h4{margin:0 0 2px;font-size:12px;font-weight:500;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.oa-release-section ul{margin:0;padding-left:18px;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}
.oa-release-section li{overflow-wrap:anywhere}
.oa-release-section li+li{margin-top:2px}
.oa-release code{padding:0 4px;border-radius:4px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
.oa-release strong{font-weight:600;color:var(--dsw-alias-label-primary)}
.oa-release a{color:var(--dsw-alias-state-business-primary)}
.oa-news-upcoming{display:flex;flex-direction:column;align-items:flex-start;gap:8px;margin-top:10px;padding-top:10px;border-top:.5px solid var(--dsw-alias-border-l2)}
.oa-foot{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:4px 8px;margin-top:40px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.oa-dialog[data-wide=true]{width:min(640px,100%);display:flex;flex-direction:column;max-height:min(720px,calc(100vh - 48px))}
.oa-changelog{flex:1;min-height:0;overflow:auto;margin:0 -20px;padding:0 20px}
.oa-changelog .oa-release+.oa-release{padding-top:12px;border-top:.5px solid var(--dsw-alias-border-l2)}
.oa-btn-link{display:inline-flex;align-items:center;text-decoration:none;margin-right:auto}
`;

/** The chat cards of comments and requests sent to the agent. */
export const CARD_CSS = `
.oac-row{display:flex;flex-direction:column;align-items:flex-end;gap:8px;width:100%}
.oac-card{box-sizing:border-box;max-width:min(calc(var(--dsh-chat-content-width, 748px) * 0.702), 82%);min-width:min(320px, 82%);
  border:0.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-xl, 12px);background:var(--dsw-alias-markdown-code-block);
  color:var(--dsw-alias-label-primary);padding:10px 14px 12px;display:flex;flex-direction:column;gap:6px}
.oac-head{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxs-12, 12px/18px sans-serif)}
.oac-head svg{flex:none}
.oac-head-text{flex:1;min-width:0;display:flex;white-space:nowrap;overflow:hidden}
.oac-head-text>span{flex:none}
.oac-head-text>.oac-head-title{flex:0 1 auto;min-width:1.5em;overflow:hidden;text-overflow:ellipsis}
.oac-toggle{flex:none;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;margin:-2px -4px -2px 0;
  border:0;border-radius:var(--dsw-radius-sm, 6px);background:none;color:inherit;cursor:pointer;padding:0}
.oac-toggle:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.oac-toggle svg{transition:transform .15s}
.oac-toggle[aria-expanded=false] svg{transform:rotate(-90deg)}
.oac-body{font-size:var(--dsh-content-font-size, 14px);line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}
.oac-meta{display:flex;flex-direction:column;gap:6px;padding-top:6px;border-top:0.5px solid var(--dsw-alias-border-l1)}
.oac-where{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxs-12, 12px/18px sans-serif);overflow-wrap:anywhere}
.oac-view{align-self:flex-start;display:inline-flex;align-items:center;gap:2px;height:24px;margin-left:-6px;padding:0 6px;border:0;
  border-radius:var(--dsw-radius-sm, 6px);background:none;color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xxs-12, 12px/18px sans-serif);cursor:pointer}
.oac-view:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.oac-view:focus-visible,.oac-toggle:focus-visible{outline:var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));outline-offset:1px}
@media (prefers-reduced-motion:reduce){.oac-toggle svg{transition:none}}
`;

/** Adds CSS to the document once; the returned function takes it away. */
export function injectStyles(id: string, css: string): () => void {
  if (typeof document === "undefined" || !css) return () => {};
  if (document.querySelector(`style[data-plugin-css="${id}"]`)) return () => {};
  const tag = document.createElement("style");
  tag.dataset.pluginCss = id;
  tag.textContent = css;
  document.head.appendChild(tag);
  return () => tag.remove();
}
