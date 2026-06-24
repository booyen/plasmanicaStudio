// Demo wiring for the <plasma-bg> runtime API. Loads the built embed + GSAP from
// CDN (GSAP is NEVER bundled into the embed — it's a page-side dependency).
import '../dist/plasma-bg.js';
import gsap from 'https://cdn.skypack.dev/gsap';
import ScrollTrigger from 'https://cdn.skypack.dev/gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const bg = document.querySelector('plasma-bg');
const DURATION = 8;

const tl = {
  duration: DURATION,
  keyframes: [
    { id: 'a', t: 0, easing: 'ease-in-out', config: { motion: 'Classic', palette: ['#2b5fff', '#00e0d0'], speed: 1 } },
    { id: 'b', t: 4, easing: 'ease-in-out', config: { motion: 'Liquid', palette: ['#ff7a3c', '#ff3c9e'], speed: 2 } },
    { id: 'c', t: 8, easing: 'ease-in-out', config: { motion: 'Classic', palette: ['#2b5fff', '#00e0d0'], speed: 1 } },
  ],
};

// Keyframe configs above are partial — the element resolves them against its
// defaults internally via the timeline sampler (both endpoints are full configs
// once captured in the studio; here we lean on defaults for a quick demo).
customElements.whenDefined('plasma-bg').then(() => {
  bg.timeline(tl);

  document.getElementById('play').onclick = () => bg.play();
  document.getElementById('pause').onclick = () => bg.pause();
  document.getElementById('warm').onclick = () => bg.animateTo({ palette: ['#ff7a3c', '#ff3c9e'], speed: 2 }, { duration: 1.2 });
  document.getElementById('cool').onclick = () => bg.set({ palette: ['#2b5fff', '#00e0d0'], speed: 1 });

  // Scroll-scrub: map page scroll over the .scroll section to timeline time.
  ScrollTrigger.create({
    trigger: '.scroll',
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: (self) => bg.seek(self.progress * DURATION),
  });
});
