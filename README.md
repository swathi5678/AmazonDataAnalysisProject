# Amazon Sales Analysis Dashboard

A deployable fullstack version of the notebook analysis. Upload an Amazon order CSV and the app calculates sales trends, top products, top customers, regional performance, customer retention, segmentation and a six-month forecast.

## Run Locally

```bash
npm start
```

Open `http://localhost:3000`.

## CSV Columns

Required:

- `Order Date`
- `Products`
- `Total Product Charges` or `Total Product Charges (Basic Price)`

Recommended:

- `Order ID`
- `Customer Name`
- `Address`
- `Qty`

## Deploy

This project has no runtime package dependencies, so it deploys cleanly on Render, Railway, Fly.io, Azure App Service or any Node host.

Use:

- Build command: `npm run build`
- Start command: `npm start`
- Node version: `18` or newer

## Project Structure

- `server.js` - Node backend, CSV parser, analytics API and static file server
- `public/index.html` - dashboard markup
- `public/styles.css` - responsive UI
- `public/app.js` - upload flow, API calls and charts
- `Amazonfullanalysis.ipynb` - original exploratory notebook
