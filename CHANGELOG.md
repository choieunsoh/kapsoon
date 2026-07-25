# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.1] - 2026-07-25

### Other

- merge coffee-core into main
- extract the platform-free core into coffee/core

## [1.3.0] - 2026-07-25

### Added

- change month by swiping the calendar grid
- step the calendar by month with buttons and invert the ramp
- print capsule counts in square calendar cells and swipe by month

### Other

- merge calendar-swipe into main
- merge calendar-cells into main

## [1.2.0] - 2026-07-24

### Added

- replace weekday heatmap with the month calendar
- add MonthCalendar month-heatmap component
- add monthGrids stat for the calendar heatmap

### Fixed

- pluralize the calendar cell's screen-reader count

### Other

- hoist dayKey in monthGrids for parity with dailyCups
- spec month calendar heatmap replacing weekday heatmap

## [1.1.1] - 2026-07-24

### Other

- hoist sorted helper and use toSorted in orderSuggestions

## [1.1.0] - 2026-07-24

### Added

- autocomplete order fields from past orders via datalist
- add orderSuggestions reducer for order autocomplete
- badge the app icon with capsules left on every refresh
- add setStockBadge Web Badging helper

### Other

- oxfmt the badge/autocomplete plan markdown
- implementation plan for badge and order autocomplete
- design for app-icon badge and order-form autocomplete

## [1.0.0] - 2026-07-24

### Fixed

- drop useless empty-object fallback in header spread

### Other

- add one-command npm run release
- update README screenshot
- refresh README for public repo and add MIT LICENSE
- initial commit
