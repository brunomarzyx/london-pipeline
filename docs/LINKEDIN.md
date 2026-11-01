# LinkedIn project entry (post after submitting)

Title: London Pipeline (Meta Global AI Developer Hackathon, Nov 2026)

Checking whether a London flat is fairly priced takes about a dozen tabs: Land Registry comps, the EPC register, flood maps, Ofsted, the planning portal. For the Meta hackathon I built a tool that does it in one go.

Paste a listing and Meta's Muse Spark model pulls street-level sales, works out a size-adjusted fair range, scores the area on eleven public datasets (flood, air quality, noise, schools, transport, new supply and more) and gives a verdict. Every number it quotes is checked against the underlying data before it's shown; if one doesn't match, it says so rather than guessing.

Example: a 70 sq m flat in SE15 at £650,000 sits inside a £587,000 to £789,000 fair range for the street. In E14, 13,145 homes are approved or under construction within 1 km, which is top 1% in London and something any buyer or landlord there should price in.

Built over ten days with Muse Code agents, Next.js and SQLite.
Repo: [link] · Demo: [link]
