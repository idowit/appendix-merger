# Process documents in the browser and authenticate at the edge

Build the product as a React and TypeScript single-page application that performs PDF and image processing in a Web Worker, while a Cloudflare Worker protects all static assets with a shared-password session gate. This keeps source documents on the user's computer and supports files beyond free serverless upload limits; the custom edge gate provides real access control on free hosting without requiring payment-card details, at the cost of shared-password rotation and responsibility for a small authentication boundary.
