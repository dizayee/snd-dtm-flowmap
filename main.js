/*
 * Copyright (c) Flowmap.gl contributors
 * SPDX-License-Identifier: MIT
 */

import {Deck} from "@deck.gl/core";
import {FlowmapLayer} from "@flowmap.gl/layers";
import {getViewStateForLocations} from "@flowmap.gl/data";
import {csv} from "d3-fetch";
import mapboxgl from "mapbox-gl";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const MAPLIBRE_STYLE = "mapbox://styles/dizayee/cmnrhgi7a001t01qz06zxcw2v";
const DATA_PATH = 'Data'; 

async function fetchData() {
  return await Promise.all([
    csv(`${DATA_PATH}/locations.csv`, (row) => ({
      id:           row.id,
      name:         row.name,
      lat:          Number(row.lat),
      lon:          Number(row.lon),
      adm_level:    row.adm_level,
      state_filter: row.state_filter,
    })),
    csv(`${DATA_PATH}/flows.csv`, (row) => ({
      origin: row.origin,
      dest:   row.dest,
      count:  Number(row.count),
      year:   row.year,
    })),
  ]).then(([locations, flows]) => ({locations, flows}));
}

fetchData().then((data) => {
  const locations = data.locations;
  const flows     = data.flows;

  const width  = window.innerWidth;
  const height = window.innerHeight;

  const autoViewState = getViewStateForLocations(
    locations,
    (loc) => [loc.lon, loc.lat],
    [width, height],
    {pad: 0.3}
  );

  const initialViewState = {
    ...autoViewState,
    latitude:  autoViewState.latitude + 3,
    longitude: autoViewState.longitude - 4,
    zoom:      autoViewState.zoom + 0.1,
    pitch:     50,
    bearing:   16,
    minZoom:   4.41,
  };

  const map = new mapboxgl.Map({
    container:   "map",
    accessToken: MAPBOX_TOKEN,
    style:       MAPLIBRE_STYLE,
    interactive: false, // deck.gl handles all interaction
    center:      [initialViewState.longitude, initialViewState.latitude],
    zoom:        initialViewState.zoom,
    bearing:     initialViewState.bearing,
    pitch:       initialViewState.pitch,
  });

  const locationById = {};
  locations.forEach((loc) => {
    locationById[loc.id] = loc;
  });

  let selectedYear = '2026';

  function flowsForYear(year) {
    return flows.filter((f) => f.year === year);
  }

  function addOption(selectEl, value, label) {
    const opt = document.createElement('option');
    opt.value       = value;
    opt.textContent = label;
    selectEl.appendChild(opt);
  }

  function buildLayer(filteredFlows) {
    return new FlowmapLayer({
      id:               "my-flowmap-layer",
      data:             {locations, flows: filteredFlows},
      onHover:          handleHover,
      pickable:         true,
      getLocationId:    (loc)  => loc.id,
      getLocationLat:   (loc)  => loc.lat,
      getLocationLon:   (loc)  => loc.lon,
      getFlowOriginId:  (flow) => flow.origin,
      getFlowDestId:    (flow) => flow.dest,
      getFlowMagnitude: (flow) => flow.count,
      getLocationName:  (loc)  => loc.name,
      clusteringEnabled:     false,
      colorScheme:           "Oranges",
      animationEnabled:      true,
      fadeEnabled:           true,
      fadeOpacityEnabled:    true,
      fadeAmount:            0.85,
      maxTopFlowsDisplayNum: 50,
      opacity:               0.85,
      locationsEnabled:      true,
      locationTotalsEnabled: true,
      locationLabelsEnabled: true,
    });
  }

  const tooltip = document.getElementById('tooltip');

  function handleHover(info) {
    if (!info || !info.object) {
      tooltip.style.display = 'none';
      return;
    }

    tooltip.style.display = 'block';
    tooltip.style.left    = (info.x + 10) + 'px';
    tooltip.style.top     = (info.y + 10) + 'px';

    const obj = info.object;

    if (obj.type === 'location') {
      // flowmap.gl strips custom fields — look up adm_level from original data
      const rawLoc   = locationById[obj.id];
      const admLevel = rawLoc ? rawLoc.adm_level : null;

      if (admLevel === 'State') {
        tooltip.innerHTML = '<strong>' + obj.name + '</strong><br/>Outgoing: ' + obj.totals.outgoingCount.toLocaleString();
      } else {
        tooltip.innerHTML = '<strong>' + obj.name + '</strong><br/>Incoming: ' + obj.totals.incomingCount.toLocaleString();
      }
    } else if (obj.type === 'flow') {
      tooltip.innerHTML = obj.origin.name + ' → ' + obj.dest.name + '<br/>' + obj.count.toLocaleString();
    }
  }

  const originFilter = document.getElementById('origin-filter');
  const allowedIds   = new Set(['1','2','3','4','5','6','7','8','9','10','11','12']);

  locations
    .filter((loc) => allowedIds.has(loc.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((loc) => addOption(originFilter, loc.id, loc.name));

  const allLocalities   = locations.filter((loc) => Number(loc.id) >= 19 && Number(loc.id) <= 193);
  const destStateFilter = document.getElementById('dest-state-filter');
  const destFilter      = document.getElementById('dest-filter');

  const uniqueStates = [];
  allLocalities.forEach((loc) => {
    if (!uniqueStates.includes(loc.state_filter)) uniqueStates.push(loc.state_filter);
  });
  uniqueStates.sort().forEach((stateName) => addOption(destStateFilter, stateName, stateName));

  function populateLocalityDropdown(selectedState) {
    destFilter.innerHTML = '<option value="">-- Pick a Locality --</option>';
    const list = selectedState
      ? allLocalities.filter((loc) => loc.state_filter === selectedState)
      : allLocalities;
    list
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((loc) => addOption(destFilter, loc.id, loc.name));
  }

  function updateLegend(filteredFlows) {
    if (filteredFlows.length === 0) {
      document.getElementById('legend-high-label').textContent = '—';
      document.getElementById('legend-mid-label').textContent  = '—';
      document.getElementById('legend-low-label').textContent  = '—';
      return;
    }
    const counts = filteredFlows.map((f) => f.count);
    const low    = Math.min(...counts);
    const high   = Math.max(...counts);
    const mid    = Math.round((low + high) / 2);
    document.getElementById('legend-high-label').textContent = high.toLocaleString();
    document.getElementById('legend-mid-label').textContent  = mid.toLocaleString();
    document.getElementById('legend-low-label').textContent  = low.toLocaleString();
  }

  const deck = new Deck({
    canvas:            "deck-canvas",
    width:             "100%",
    height:            "100%",
    initialViewState:  initialViewState,
    controller:        true,
    _animate:          true,
    map:               true,
    onViewStateChange: (change) => {
      const viewState = change.viewState;
      map.jumpTo({
        center:  [viewState.longitude, viewState.latitude],
        zoom:    viewState.zoom,
        bearing: viewState.bearing,
        pitch:   viewState.pitch,
      });
    },
    layers: [],
  });

  const btnOrigin   = document.getElementById('btn-origin');
  const btnDest     = document.getElementById('btn-dest');
  const instruction = document.getElementById('filter-instruction');

  const originInstruction = 'Pick a state to see all flows going out.<br/>Line thickness shows relative volume.';
  const destInstruction   = 'Pick a locality to see which states flow into it.<br/>Line thickness shows relative volume.';

  function applyCurrentFilter() {
    let filtered;
    if (btnOrigin.classList.contains('active')) {
      filtered = flowsForYear(selectedYear).filter((f) => f.origin === originFilter.value);
    } else {
      filtered = destFilter.value
        ? flowsForYear(selectedYear).filter((f) => f.dest === destFilter.value)
        : [];
    }
    deck.setProps({layers: [buildLayer(filtered)]});
    updateLegend(filtered);
  }

  btnOrigin.addEventListener('click', () => {
    btnOrigin.classList.add('active');
    btnDest.classList.remove('active');
    instruction.innerHTML          = originInstruction;
    originFilter.style.display     = '';
    destStateFilter.style.display  = 'none';
    destFilter.style.display       = 'none';
    destStateFilter.value = '';
    destFilter.value      = '';
    originFilter.value    = '1';
    applyCurrentFilter();
  });

  btnDest.addEventListener('click', () => {
    btnDest.classList.add('active');
    btnOrigin.classList.remove('active');
    instruction.innerHTML          = destInstruction;
    originFilter.style.display     = 'none';
    destStateFilter.style.display  = '';
    destFilter.style.display       = '';
    originFilter.value    = '';
    destStateFilter.value = '';
    destFilter.value      = '';
    populateLocalityDropdown('');
    applyCurrentFilter();
  });

  originFilter.addEventListener('change', () => applyCurrentFilter());

  destStateFilter.addEventListener('change', () => {
    populateLocalityDropdown(destStateFilter.value);
    destFilter.value = '';
    applyCurrentFilter();
  });

  destFilter.addEventListener('change', () => applyCurrentFilter());

  const btn2024 = document.getElementById('btn-2024');
  const btn2025 = document.getElementById('btn-2025');
  const btn2026 = document.getElementById('btn-2026');

  function setYear(year) {
    selectedYear = year;
    btn2024.classList.remove('active');
    btn2025.classList.remove('active');
    btn2026.classList.remove('active');
    if (year === '2024') btn2024.classList.add('active');
    if (year === '2025') btn2025.classList.add('active');
    if (year === '2026') btn2026.classList.add('active');
    applyCurrentFilter();
  }

  btn2024.addEventListener('click', () => setYear('2024'));
  btn2025.addEventListener('click', () => setYear('2025'));
  btn2026.addEventListener('click', () => setYear('2026'));

  originFilter.value = '1';
  applyCurrentFilter();
});
