/* 
  PWA Icons for Shree Shyam Pharmacy
  
  Since we can't generate actual PNG files here, use this SVG as your base icon.
  Convert it to PNG files of different sizes using:
  - https://realfavicongenerator.net
  - https://www.pwabuilder.com/imageGenerator
  
  Or create icons manually in Canva/Figma.
  
  Required sizes:
  - 72x72
  - 96x96
  - 128x128
  - 144x144
  - 152x152
  - 192x192
  - 384x384
  - 512x512
*/

/* Base Icon SVG - Copy this and create PNGs */
const iconSVG = `
<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="512" height="512" rx="128" fill="url(#gradient)"/>
  
  <!-- Pill Icon -->
  <g transform="translate(128, 128)">
    <path d="M208 48L48 208c-25 25-25 65 0 90s65 25 90 0l160-160c25-25 25-65 0-90s-65-25-90 0z" 
          fill="white" 
          stroke="white" 
          stroke-width="16" 
          stroke-linecap="round"/>
    <line x1="128" y1="128" x2="168" y2="168" 
          stroke="rgba(16, 185, 129, 0.3)" 
          stroke-width="16" 
          stroke-linecap="round"/>
  </g>
  
  <!-- Gradient Definition -->
  <defs>
    <linearGradient id="gradient" x1="0" y1="0" x2="512" y2="512">
      <stop offset="0%" stop-color="#10b981"/>
      <stop offset="100%" stop-color="#0d9488"/>
    </linearGradient>
  </defs>
</svg>
`;

console.log('Use the SVG above to generate PNG icons');
