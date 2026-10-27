// "In short" boxes: the plain-words summary at the top of each data page.
// All the text lives here, so it is edited in one place. site.js puts the box on the page.
//
//   text:   paragraphs. {id.key} inserts a live number from indicators.js, e.g. {air.vd} or {co2.now}.
//           The keys for each indicator are listed in indicators.js (the object each loader returns).
//   claims: answers on claims.html to link to, by their id (see CLAIMS below).
//   units:  the numbers in everyday terms: what the page's units mean, with comparisons a non-scientist can picture.
//
// Keep it short: two or three sentences that someone with no science background can follow.

window.CLAIMS = {
  'hoax':             '"Man-made climate change is a hoax"',
  'natural-cycles':   '"It\'s just natural cycles" or "it\'s the sun"',
  'always-changed':   '"The climate has always changed"',
  'trace-gas':        '"CO₂ is a trace gas, it can\'t matter"',
  'antarctic-ice':    '"Antarctic sea ice is growing"',
  'glacier-growing':  '"That glacier is bigger than ten years ago"',
  'stopped-1998':     '"Warming stopped in 1998"',
  'sea-level':        '"Sea level rise is tiny"',
  'data-manipulated': '"The data is manipulated"',
  'us-adjustments':   '"NOAA\'s adjustments create the US warming"',
  'saturated':        '"The CO₂ effect is saturated"',
  'volcano':          '"Mauna Loa is a volcano"',
  'plant-food':       '"CO₂ is plant food"',
  'arctic-recovered': '"Arctic sea ice has recovered"',
  'cooling':          '"It\'s freezing here" or "it\'s cooling"',
  'records-short':    '"The records are too short or patchy"',
  'urban-heat':       '"It\'s just cities (urban heat islands)"',
  'cold-deaths':      '"More people die of cold than heat"',
  'least-cost':       '"It\'s not big enough to justify more than least-cost measures"',
  'adapt':            '"Plants and animals will adapt"',
  'too-late':         '"It\'s too late, so nothing matters"',
  'weather-blame':    '"Every bit of weather gets blamed on climate change"',
  'ice-age-1970s':     '"In the 1970s they predicted an ice age"',
  'no-consensus':      '"There is no real consensus"',
  'predictions-fail':  '"The experts\' predictions always fail"',
  'how-much-human':    '"Scientists disagree on how much is human"',
  'models-unreliable': '"Models can\'t tell what humans do"',
  'little-ice-age':    '"It\'s just the recovery from the Little Ice Age"',
  'co2-not-ours':      '"The CO₂ rise isn\'t from us" or "volcanoes emit more"',
  'cows':              '"Now they blame cow farts"',
  'medieval-warm':     '"The Medieval Warm Period was warmer"',
  'solar-heat':        '"Solar farms cause the heat"',
  'wildfires':         '"Wildfires are natural, or bad forest management"',
  'emissions-falling': '"Emissions are already falling"',
  'fewer-affected':    '"Fewer people are affected by extreme weather"',
  'god-in-control':    '"God will take care of it"',
  'geothermal-antarctica': '"Volcanic heat is melting Antarctica"',
  'hunga-tonga':       '"The record heat came from Hunga Tonga"',
  'two-degrees':       '"Two degrees is nothing"',
  'dinosaurs':         '"Life thrived when it was much warmer"',
  'hurricanes':        '"Hurricanes aren\'t getting worse"',
  'polar-bears':       '"Polar bears are thriving"',
  'crop-records':      '"Crop yields keep breaking records"',
  'coral-recovering':  '"Coral reefs are recovering"',
  'acidification-myth': '"Ocean acidification is a myth"',
  'adapt-dutch':       '"We\'ll just adapt, like the Dutch"',
  'china-india':       '"China and India emit more"',
  'only-one-percent':  '"My country is only 1%"',
  'renewables-grid':   '"Renewables can\'t run a grid"',
  'ev-worse':          '"Electric cars are worse"',
  'solar-payback':     '"Solar panels never pay back their energy"',
  'turbines-birds':    '"Wind turbines kill birds"',
  'tech-later':        '"Technology will fix it later"',
  'individual-pointless': '"Individual action is pointless"',
  'net-zero-bankrupt': '"Net zero will bankrupt us"',
  'no-experiment':    '"Science is proven by experiment, not forecasts"',
  'era5-model':        '"ERA5 is a model, it can\'t be trusted"',
  'climate-optimum':   '"We\'re enjoying a climate optimum"',
  'already-15':        '"1.5 °C was already passed"',
  'heatwaves-always':  '"Heat waves have always happened"',
  'scenarios-fantasy': '"Climate scenarios rely on fantasy technology"',
};

window.IN_SHORT = {
  'air.html': {
    units: 'A rise of 1 or 1.5 °C sounds small, but it is an average over the whole planet, day and night, all year. For comparison: the world at the height of the last ice age, with ice sheets over much of North America and Europe, was only about 5–6 °C colder on average than before industrialization. Land has also warmed considerably faster than the ocean, so most places people live have warmed more than the global figure.',
    text: [
      'The average temperature of the air near the surface, across the whole planet. It is the warming people feel, and the measure the Paris Agreement limits of 1.5 °C and 2 °C refer to.',
      'Right now: {air.vd}, {air.now} compared with the 1991–2020 average for {air.date}. Over the last 12 months the planet was about {air.pre12} warmer than before industrialization (1850–1900).',
    ],
    claims: ['stopped-1998', 'cooling', 'weather-blame', 'natural-cycles', 'records-short', 'urban-heat', 'data-manipulated', 'us-adjustments', 'era5-model', 'already-15', 'heatwaves-always'],
  },
  'nino.html': {
    units: 'The Niño 3.4 region is a strip of the equatorial Pacific about 5,500 km long and 1,100 km wide, roughly three-quarters the size of the lower 48 US states. An El Niño is declared when it stays at least 0.5 °C above average for several months; above about 1.5 °C counts as strong.',
    text: [
      'El Niño and La Niña are a natural cycle in the tropical Pacific. Every few years the ocean there turns unusually warm (El Niño) or cool (La Niña), which pushes global temperatures up or down for a year or so. This page tracks the key region, called Niño 3.4.',
      '{nino.vd}. The central Pacific is {nino.now} compared with the 1991–2020 average for {nino.date}. These swings come and go; the long-term warming continues through both phases.',
      'This is the traditional daily index. NOAA\'s official index averages three months and subtracts the warming of the whole tropics (the "relative" index), so it reads lower; both show the same event.',
    ],
    claims: ['natural-cycles', 'stopped-1998', 'hurricanes'],
  },
  'land-ice.html': {
    units: "A gigaton (Gt) is a billion metric tons: a block of ice about one kilometer long, wide and high. It takes 362 Gt of melted ice to raise the world's sea level by 1 mm.",
    text: [
      'Greenland and Antarctica hold most of the world\'s fresh water as ice; mountain glaciers hold far less, but react quickly to warming. Since 2002 the GRACE satellites have weighed the two ice sheets every month; glaciers are measured on the ground and from space once a year. Unlike sea ice, ice that melts or slides off land adds water to the ocean and raises sea level.',
      'Latest ({land.date}): {land.vd}. Since 2002–03 Greenland has lost about {land.gl} and Antarctica about {land.an}, together adding {land.mm} to global sea level. The world\'s glaciers lost {land.glac} in the hydrological year {land.gh}.',
    ],
    claims: ['glacier-growing', 'sea-level', 'antarctic-ice'],
  },
  'slow.html': {
    units: "CO₂ emissions of about 38 billion metric tons a year are close to 5 metric tons for every person on Earth, about 13 kg a day. The Atlantic overturning moves about 16–17 sverdrups (Sv; 1 Sv = 1 million cubic meters per second): some 6,500 to 6,800 Olympic swimming pools every second, or about 14 times the flow of all the world's rivers together. A drop of 0.1 in pH means about 26% more acidity. A hectare is 100 × 100 m, about one and a half soccer pitches. The ground that thaws each summer at the Arctic permafrost sites is typically from about 30 cm to a meter deep.",
    text: [
      'In {fossil.through} the world emitted {fossil.now} of CO₂ from fossil fuels and cement ({fossil.ch} on the year before). About a quarter of it ends up in the ocean, which is slowly becoming more acidic: near Hawaiʻi, surface water has {ph.hplus} more acidity than in {ph.since}.',
      'The Atlantic overturning circulation, which carries warmth north towards Europe, averaged {amoc.a12} over the 12 months to {amoc.through}. It varies a lot, and two decades of direct measurements are not yet enough to confirm a long-term weakening, though climate models expect one.',
      'The Red List Index of extinction risk fell from {rli.first} in {rli.y0} to {rli.now} in {rli.through} ({rli.pct}): on balance, species are moving closer to extinction. On land, {trees.now} of tree cover was lost in {trees.through}, and the cherry trees of Kyoto, recorded since the year 812, now bloom about {blossom.earlier} earlier than before 1850.',
      'In the far north, the ground above the permafrost thaws each summer; at Arctic monitoring sites the thaw in {thaw.through} reached {thaw.pct} compared with the 2001–2020 average (+ is deeper). Thawing permafrost releases carbon that has been frozen for thousands of years.',
    ],
    claims: ['adapt'],
  },
  'boundaries.html': {
    units: 'The boundaries use different units: parts per million of CO₂, watts per square meter of extra warming push, extinctions per million species per year, millions of metric tons of nitrogen and phosphorus, the share of land with unusual river flow or soil moisture. To compare them, the chart puts each on the same scale: 0 is the pre-industrial or Holocene-like level, 1 is the boundary, 2 is where the high-risk zone begins. Nitrogen fixed for farming, for example, is about 165 million metric tons a year against a boundary of 62: more than two and a half times the safe level.',
    text: [
      'Climate change is one of nine planetary boundaries: limits on how hard people can push the Earth system before the risk of large, lasting changes rises. The Planetary Health Check 2026, by more than 60 scientists, finds seven of the nine crossed: climate change, biosphere integrity, land use, freshwater, nitrogen and phosphorus, ocean acidification and novel entities (untested chemicals and plastics).',
      'Two are still within their boundaries worldwide: the ozone layer and aerosol haze. The furthest into the high-risk zone are nitrogen and phosphorus put on farmland, the overall human warming push, and the loss of species and of the energy left for wild nature. Most numbers on this page are the report\'s assessments of data that are one to several years old; CO₂ is measured here, live.',
    ],
    claims: [],
  },
  'models.html': {
    units: 'A warming rate of 0.2 °C per decade is 2 °C per century. One gigaton (Gt) is a billion metric tons: 130 Gt of CO₂ is about three years of the world\'s current emissions, or some 16 metric tons for every person on Earth. A W/m² (watt per square meter) of forcing is the extra energy that greenhouse gases keep in, spread over the whole planet: 1 W/m² over Earth\'s surface is about 500 trillion watts, roughly 25 times the power that all of humanity uses.',
    text: [
      'Scientists have published warming projections since 1970, so they can be checked. A 2020 study of 17 projections from 1970 to 2007 found that 10 matched the warming that followed, and 14 once the real rise in greenhouse gases is taken into account. Most misses came from guessing future emissions, not from the physics.',
      'Today\'s climate models also track the measurements. What comes next depends on emissions: with today\'s policies, about 2.8 °C by 2100 (UNEP estimate). Staying under 1.5 °C leaves about 130 billion metric tons of CO₂ from the start of 2026, roughly three years of current emissions.',
    ],
    claims: ['predictions-fail', 'models-unreliable', 'ice-age-1970s', 'scenarios-fantasy', 'too-late'],
  },
  'pdo.html': {
    units: "The PDO index has no unit: it measures how strongly the North Pacific matches the PDO's typical pattern. Zero is neutral, beyond +1 or −1 is a strong phase, and one phase can last from a few years to a few decades.",
    text: [
      'The Pacific Decadal Oscillation (PDO) is a slow, El Niño-like swing in the North Pacific. In its warm (positive) phase the water along North America runs warm; in its cool (negative) phase the reverse. Phases last years to decades and nudge global temperatures and weather around the Pacific.',
      'Latest ({pdo.date}): {pdo.now}. {pdo.vd}. The 12-month average is {pdo.a12}. Like El Niño, the PDO moves heat around; it does not add heat to the planet.',
    ],
    claims: ['natural-cycles'],
  },
  'sun.html': {
    units: "The sunspot number is roughly the number of dark spots on the Sun's face, with each group of spots counted extra: close to 0 at solar minimum, 100 to 200 or more at maximum. The Sun's 0.1% swing in energy over a cycle is small next to the extra energy the planet now keeps because of greenhouse gases (see the Energy imbalance page).",
    text: [
      'The Sun\'s activity rises and falls over a cycle of about 11 years, tracked by counting sunspots since the 1700s. At solar maximum the Sun gives off about 0.1% more energy, worth roughly 0.1 °C of global temperature.',
      'Latest ({sun.date}): sunspot number {sun.now}. {sun.vd}. The Sun has not become more active since the 1950s while the planet warmed, so it cannot explain the warming.',
    ],
    claims: ['natural-cycles'],
  },
  'sst.html': {
    units: 'A few tenths of a degree across the whole ocean surface is an enormous amount of extra heat, because water stores so much of it. For corals the threshold is close: they start to bleach when the water stays about 1 °C above its usual summer maximum for several weeks.',
    text: [
      'The average temperature of the ocean surface between 60°S and 60°N, measured by satellites, ships and buoys. Oceans cover 70% of the planet. Warmer seas feed heavier rain and stronger storms, and bleach coral reefs.',
      'Right now: {sst.vd}, {sst.now} compared with the 1991–2020 average for {sst.date}. This chart uses the satellite-era record, which starts in {sst.first}; measurements from ships go back to the 1850s.',
    ],
    claims: ['natural-cycles', 'weather-blame', 'urban-heat', 'records-short', 'data-manipulated'],
  },
  'corals.html': {
    units: 'A reef region counts as under bleaching-level heat stress once the heat built up over the last 12 weeks reaches about 4 °C-weeks: for example, 1 °C above the usual warmest month for 4 weeks, or 2 °C for 2 weeks (NOAA Coral Reef Watch\'s Alert Level 1).',
    text: [
      'Corals live close to their upper temperature limit. When the water stays about 1 °C above its usual summer maximum for several weeks, they expel the algae that feed them and turn white: they bleach. Short heat they can survive; long or repeated heat kills them.',
      'Satellites measure the heat every day; divers confirm the bleaching. Four global bleaching events have struck since 1998, the latest (2023–2025) reaching 84% of the world\'s reef area, the largest so far.',
    ],
    claims: ['coral-recovering'],
  },
  'ohc.html': {
    units: "A zettajoule (ZJ) is a billion trillion joules. One ZJ is about the energy of 16 million Hiroshima bombs (63 terajoules each), or almost twice humanity's total energy use in a year.",
    text: [
      'How much heat is stored in the upper 2000 meters of the ocean. About 90% of the extra heat trapped by greenhouse gases ends up here (IPCC), so this is the steadiest measure of global warming, with little year-to-year noise.',
      'Latest ({ohc.date}): {ohc.vd}. The ocean gained {ohc.d12} of heat in 12 months. One ZJ is 10²¹ joules; that gain is about {ohc.energyX} all the energy humanity uses in a year.',
      'Measured to 700 m since {ohc.first7}, and to 2000 m since {ohc.first2}, when thousands of Argo floats reached every ocean.',
    ],
    claims: ['natural-cycles', 'stopped-1998', 'records-short'],
  },
  'sea-level.html': {
    units: 'Each millimeter of sea level over the whole ocean is about 360 cubic kilometers of water, roughly three-quarters of Lake Erie. On the coast, what matters is that every high tide and storm surge starts from a higher level, so floods reach further inland and happen more often.',
    text: [
      'The average height of the world\'s oceans, measured by satellites since 1993. The sea rises because warming water expands and because ice on land melts into it.',
      'Latest ({sl.through}): {sl.vd}. The sea is {sl.rise} higher than in 1993, rising {sl.r10} per year over the last 10 years, compared with {sl.r0} per year in 1993–2002.',
    ],
    claims: ['sea-level', 'data-manipulated'],
  },
  'sea-ice.html': {
    units: 'Extent is in millions of square kilometers: 1 million km² is about the size of Texas and California together. Volume is in thousands of cubic kilometers: 1,000 km³ is about a twelfth of Lake Superior.',
    text: [
      'How much of the ocean is covered by sea ice, in the Arctic and around Antarctica, measured by satellites since 1978. Bright ice reflects sunlight; open water absorbs it, so losing ice adds to warming.',
      'Arctic ({ice.date}): {ice.vd}, {ice.an} compared with 1981–2010. Antarctic ({ant.date}): {ant.vd}, {ant.an} compared with 1981–2010.',
      'The {ice.minN} lowest Arctic summer minimums on record have all come since {ice.minSince}.',
    ],
    claims: ['arctic-recovered', 'antarctic-ice'],
  },
  'co2.html': {
    units: '420 parts per million (ppm) means 420 of every million molecules of air are CO₂, about 0.04%. Small amounts can have a large effect: the legal limit for blood alcohol when driving in most US states is 0.08%. Before industrialization the air held about 280 ppm; the level has not been as high as today for millions of years.',
    text: [
      'The amount of carbon dioxide in the air, measured at Mauna Loa in Hawaii since 1958. CO₂ is the main driver of global warming, mostly from burning coal, oil and gas, and much of it stays in the air for centuries.',
      'Latest: {co2.now} (30-day average to {co2.date}), {co2.pct} more than before industrialization. {co2.vd}.',
    ],
    claims: ['trace-gas', 'volcano', 'plant-food', 'always-changed', 'too-late'],
  },
  'ch4.html': {
    units: 'About 1,900 parts per billion (ppb) means roughly 2 of every million molecules of air are methane, some 200 times fewer than CO₂. But over 20 years each methane molecule traps about 80 times as much heat as a CO₂ molecule (IPCC), so methane is responsible for roughly 30% of the warming so far.',
    text: [
      'Methane is the second biggest driver of warming after CO₂. It comes from oil, gas and coal production, farming (mainly cattle and rice), landfills and wetlands. It traps far more heat per molecule than CO₂ but breaks down within about a decade, so cutting it slows warming quickly.',
      'Latest ({ch4.date}): {ch4.now}, {ch4.vd}. It rose {ch4.rise} in {ch4.riseYear}.',
    ],
    claims: ['trace-gas', 'too-late'],
  },
  'ghg.html': {
    units: 'W/m² means watts per square meter of Earth\'s surface. The 3.5 W/m² from all greenhouse gases together, spread over the whole planet, is about 1,800 trillion watts, roughly 90 times all the energy humanity uses. ppb and ppt are parts per billion and per trillion: a few hundred ppt of a CFC is tiny, but ton for ton these gases trap thousands of times more heat than CO₂.',
    text: [
      'CO₂ and methane are not the only heat-trapping gases. This page adds up all the long-lived ones: CO₂, methane, nitrous oxide (mostly from farming), and the CFCs, HCFCs, HFCs and SF₆ made in factories.',
      'In {ghg.year} they added {ghg.now} of warming effect, {ghg.up} more than in 1990; CO₂ is {ghg.co2share} of it. Nitrous oxide is at {ghg.n2o} ({ghg.n2oDate}). The CFCs that damaged the ozone layer are falling since the Montreal Protocol, while their replacements are rising.',
    ],
    claims: ['trace-gas', 'cows', 'too-late'],
  },
  'water.html': {
    units: '1 kg/m² of water vapor is a 1 mm layer of water if it all fell as rain at once. The whole atmosphere holds about 25 mm, some 13,000 km³: if it all rained out, it would fill Lake Erie about 26 times. The air recycles that water every 10 days or so.',
    text: [
      'How much water vapor the air holds, averaged over the whole globe. Warmer air holds more: about 7% more for every 1 °C (basic physics). More water in the air means heavier downpours, and, with rain coming in bigger bursts, longer dry spells in between (IPCC). A downpour does not make up for a dry spell: rain that falls faster than the soil can soak it up runs off, causing floods, instead of reaching the roots and groundwater.',
      'Latest ({wv.date}): {wv.now}, {wv.an} vs the 1991–2020 average for that month; {wv.rank}. Last 12 months: {wv.l12}.',
      'Warmer air also pulls more water out of the ground. Further down, the page follows root-zone soil moisture (modelled by ERA5): how much of the world\'s land is in drought, and how often flash droughts strike, droughts that set in within weeks.',
    ],
    claims: ['weather-blame', 'trace-gas'],
  },
  'wildfires.html': {
    units: 'One million metric tons (1 Mt) of CO₂ is roughly what 200,000 cars emit in a year. Canada\'s fires in 2023 released about 1,300 Mt, more than Japan emits from fossil fuels in a year (about 1,000 Mt).',
    text: [
      'How much CO₂ fires release, worldwide and by region, estimated week by week from satellites since 2003. Worldwide the total has gone down, because fewer savannas burn as land is farmed; but in the northern forests, fires are getting bigger, and the carbon they release does not grow back within a lifetime.',
      'So far in {fire.y} (to {fire.date}): {fire.now} of CO₂ worldwide, {fire.vd}.',
    ],
    claims: ['wildfires', 'extreme-picks'],
  },
  'eei.html': {
    units: '1 W/m² sounds tiny, about the power of a small night light for every square meter. But Earth has 510 million km² of surface, so 1 W/m² over the whole planet is about 510 terawatts: more than 25 times all the energy humanity uses.',
    text: [
      'The difference between the energy Earth receives from the sun and the energy it sends back to space, measured by NASA satellites since 2000. When more comes in than goes out, the planet has to heat up. This is the warming at its source.',
      'Latest: over the 12 months to {eei.date}, Earth gained {eei.l12} (watts per square meter, averaged over the whole planet). {eei.vd}.',
    ],
    claims: ['natural-cycles', 'saturated', 'trace-gas', 'too-late'],
  },
};
