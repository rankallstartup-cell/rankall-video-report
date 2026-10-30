// Shared footer grid for the homepage footer (app/page.tsx) and the site
// footer (components/Footer.tsx). The old grid used auto-fit columns with a
// brand block spanning 2 tracks, so on desktop the third link column
// (COMPANY) wrapped onto its own row under the brand block. This grid is
// explicit at every width:
//   desktop (>960px)  brand | PRODUCT | RESOURCES | COMPANY
//   tablet (561-960)  brand full width, then 3 link columns
//   phone (<=560)     brand full width, then 2 link columns
export const FOOTER_GRID_CSS = `
.ra-fgrid{display:grid;grid-template-columns:minmax(0,1.6fr) repeat(3,minmax(0,1fr));gap:48px 40px;align-items:start}
.ra-fbrand{display:flex;flex-direction:column;gap:20px;min-width:0;max-width:420px}
.ra-fcol{display:flex;flex-direction:column;gap:12px;min-width:0}
.ra-fcol a{overflow-wrap:anywhere}
.ra-fbottom{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}
.ra-flegal{display:flex;gap:12px 20px;flex-wrap:wrap}
@media (max-width:960px){
  .ra-fgrid{grid-template-columns:repeat(3,minmax(0,1fr));gap:40px 24px}
  .ra-fbrand{grid-column:1/-1;max-width:560px}
}
@media (max-width:560px){
  .ra-fgrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:32px 20px}
  .ra-fbottom{flex-direction:column;align-items:flex-start}
}
`;
