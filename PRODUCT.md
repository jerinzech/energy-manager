# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Plain static HTML/CSS/JS (single file, no build step). Delegated choice accepted from user.

## Users

Primary: facility/energy managers planning EV charging one day ahead, and classroom instructors using it as a teaching/demo tool (dual audience, equally). Secondary: employees whose vehicles are charged (no identity surfaced).

## Product Purpose

Interactive dashboard prototype "Grid-Sense – Workplace Energy Manager" that demonstrates planning EV charging one day ahead to reduce site electricity peaks, use available solar generation, reduce energy cost, and ensure vehicles are ready by departure time. Classroom simulation; no real building, charger, or employee data.

## Positioning

Deterministic synthetic simulation with human-in-the-loop approval (approve/modify/reject) and explainable per-vehicle charging rationale; privacy-preserving (no employee identity or attendance analysis).

## Operating Context

Browser-based demo; forecast horizon 06:00–20:00; 12 representative charging sessions; scenario switching (sunny/cloudy/cold/80% occupancy/unexpected peak); manager controls (max site demand, min charge, priority, urgent trip).

## Capabilities and Constraints

- Time-series forecast: building demand, EV charging demand, solar generation, total grid demand.
- KPI cards; EV session table; AI optimization before/after; manager controls; explainability; monitoring metrics; scenario buttons.
- All calculations synthetic and deterministic; no external APIs.
- No real data; financial values labeled SIMULATED.

## Brand Commitments

Palette: dark blue / electric green / white (per prompt). No logo assets provided.

## Evidence on Hand

Source brief: `ai energy.txt`. Proposal PDF present. No real data, testimonials, or benchmarks.

## Product Principles

- Deterministic, reproducible simulation.
- Human approval visible and required.
- Privacy: no employee identity or attendance analysis.
- Explainability for every scheduled vehicle.
- Scenario-driven exploration for teaching.

## Accessibility & Inclusion

No specific standard mandated; aim for readable contrast, keyboard-friendly controls, responsive layout.