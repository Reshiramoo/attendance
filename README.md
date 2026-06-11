# Attendance Tracker

A simple personal work hour tracker built with React and Vite.

## Features

- Clock In / Clock Out logging
- Saved data in the browser via `localStorage`
- Daily, weekly, and monthly filters
- Per-entry delete management
- Graphs for last 7 days and last 4 weeks
- Average weekly hours and summary statistics

## Local development

```bash
npm install
npm run dev
```

Then open the local Vite URL shown in the terminal.

## Build

```bash
npm run build
```

The production bundle is generated into `dist`.

## Data persistence

Attendance entries are stored locally in the browser using `localStorage`. That means:

- Your data remains after refresh and rerunning the app in the same browser.
- Other users on the public page see their own local data, not yours.

## Notes

- This is a personal tracker with no shared backend.

Attendance entries are stored locally in the browser using `localStorage`. That means:

- Your data remains after refresh and rerunning the app in the same browser.
