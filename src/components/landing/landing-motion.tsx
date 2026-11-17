'use client';

import { useEffect } from 'react';
import { getGsap } from '@/lib/client/gsap';
import { whenIntroDone } from '@/lib/client/intro';
import { prefersReducedMotion } from '@/lib/client/use-reduced-motion';

const REVEAL_SUBJECTS =
  '.sec-head,.feature,.token-card,.terminal,.tier-card,.grad-display,.grad-steps,.launch-form,.bridge-widget,.proof-card,.architecture-shell,.manifesto-line,.manifesto-kicker,.manifesto-inner>p,.arch-heading,.section-label';

const HEADING_BLOCKS =
  '.sec-head,.check-copy,.tier-intro,.launch-intro,.bridge-layout>div:first-child,.v3-thesis-copy,.v3-dvn-intro';

/**
 * Koreografi scroll landing (DESIGN_SYSTEM §7.2), di-port dari skrip GSAP HTML konsep.
 * Komponen ini tidak merender apa pun: ia menganimasikan markup section yang sudah ada,
 * di dalam satu gsap.context() yang di-revert saat unmount. Tidak berjalan pada reduced motion.
 */
export function LandingMotion() {
  useEffect(() => {
    const main = document.querySelector<HTMLElement>('main#top');
    if (!main || prefersReducedMotion()) return;

    const { gsap, ScrollTrigger } = getGsap();
    const fine = window.matchMedia('(pointer:fine)').matches;
    const wide = window.matchMedia('(min-width:901px)').matches;
    const cleanups: Array<() => void> = [];

    const $ = <T extends Element = HTMLElement>(selector: string, root: ParentNode = main) =>
      root.querySelector<T>(selector);
    const $$ = <T extends Element = HTMLElement>(selector: string, root: ParentNode = main) =>
      Array.from(root.querySelectorAll<T>(selector));
    const outside = (el: Element) => !el.closest('.manifesto-section');

    // Transisi hover CSS akan "menyeret" tween per-frame, jadi dimatikan selama GSAP memegang elemen.
    const hold = (els: Element[]) => els.forEach((el) => el.classList.add('fx-hold'));
    const release = (els: Element[]) => () =>
      els.forEach((el) => {
        el.classList.remove('fx-hold');
        gsap.set(el, { clearProps: 'transform,filter,opacity,willChange' });
      });

    /* ---- manifesto: reveal berbasis IntersectionObserver (tetap seperti V4) ---- */
    const subjects = $$(REVEAL_SUBJECTS);
    const revealSet = subjects.filter((el) => el.closest('.manifesto-section'));
    revealSet.forEach((el) => {
      el.classList.add('reveal');
      // Indeks diambil dari daftar penuh supaya stagger manifesto sama dengan HTML.
      el.style.setProperty('--reveal-delay', `${(subjects.indexOf(el) % 4) * 75}ms`);
    });
    const revealObserver = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('in-view');
          revealObserver.unobserve(entry.target);
        }),
      { threshold: 0.07, rootMargin: '0px 0px -25px 0px' },
    );
    revealSet.forEach((el) => revealObserver.observe(el));
    document.body.classList.add('motion-ready');
    cleanups.push(() => {
      revealObserver.disconnect();
      document.body.classList.remove('motion-ready');
      revealSet.forEach((el) => el.classList.remove('reveal', 'in-view'));
    });

    /* ---- manifesto: huruf bergeser mengikuti scroll ---- */
    const manifesto = $('.manifesto-section');
    const kinetic = $$('.manifesto-line');
    if (manifesto) {
      let busy = false;
      const scrollKinetic = () => {
        if (busy) return;
        busy = true;
        requestAnimationFrame(() => {
          const rect = manifesto.getBoundingClientRect();
          if (rect.bottom > 0 && rect.top < window.innerHeight) {
            const f = Math.max(0, Math.min(1, (window.innerHeight - rect.top) / (window.innerHeight + rect.height)));
            kinetic.forEach((line, i) =>
              line.style.setProperty('--kineticX', `${(i % 2 === 0 ? -1 : 1) * (f - 0.5) * 64}px`),
            );
          }
          busy = false;
        });
      };
      window.addEventListener('scroll', scrollKinetic, { passive: true });
      scrollKinetic();
      cleanups.push(() => window.removeEventListener('scroll', scrollKinetic));
    }

    /* ---- kartu: sorotan mengikuti pointer ---- */
    if (fine) {
      const onSpot = (event: PointerEvent) => {
        const card =
          event.target instanceof Element
            ? event.target.closest<HTMLElement>('.feature,.token-card,.tier-card,.proof-card')
            : null;
        if (!card) return;
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--spotX', `${event.clientX - rect.left}px`);
        card.style.setProperty('--spotY', `${event.clientY - rect.top}px`);
      };
      main.addEventListener('pointermove', onSpot, { passive: true });
      cleanups.push(() => main.removeEventListener('pointermove', onSpot));
    }

    const context = gsap.context(() => {
      /* ---- hero: masuk, lalu defocus saat ditinggalkan ---- */
      const hero = $('.hero');
      if (hero) {
        const intro = [
          ...$$('.hero .top-rule,.hero .v3-hero-coordinate'),
          ...$$('.hero h1>span'),
          ...$$('.hero .hero-desc,.hero .hero-actions,.hero .hero-foot'),
        ];
        // Intro hero menunggu intro loader (D19): baris disembunyikan sekarang, dimainkan saat iris terbuka.
        const fromLoader = document.querySelector('[data-intro-loader]') !== null;
        const heroIntro = gsap.timeline({ paused: true });
        heroIntro.from(
          intro,
          {
            yPercent: 35,
            opacity: 0,
            filter: 'blur(14px)',
            duration: 1.15,
            ease: 'power3.out',
            stagger: 0.085,
            clearProps: 'transform,filter,opacity',
          },
          0.1,
        );
        if (fromLoader) {
          // Zoom out: lanjutan dari kamera loader yang menyelam masuk.
          heroIntro.fromTo(
            hero,
            { scale: 1.07 },
            { scale: 1, duration: 1.5, ease: 'power3.out', immediateRender: false, clearProps: 'transform' },
            0,
          );
        }
        gsap.to('.hero-copy', {
          yPercent: -9,
          opacity: 0.12,
          filter: 'blur(9px)',
          ease: 'none',
          scrollTrigger: { trigger: hero, start: 0, end: () => `+=${hero.offsetHeight * 0.85}`, scrub: 0.4 },
        });
        const supply = $$('.hero-foot strong').find((el) => /^[\d,]+$/.test((el.textContent ?? '').trim()));
        if (supply) {
          const target = Number((supply.textContent ?? '').replace(/,/g, ''));
          const counter = { v: 0 };
          heroIntro.to(
            counter,
            {
              v: target,
              duration: 1.9,
              ease: 'power2.out',
              onUpdate: () => {
                supply.textContent = Math.round(counter.v).toLocaleString('en-US');
              },
            },
            0.9,
          );
        }
        cleanups.push(whenIntroDone(() => heroIntro.play()));
      }

      /* ---- heading: reveal per baris (baris sudah dipecah oleh <SplitHeading>) ---- */
      $$(HEADING_BLOCKS)
        .filter(outside)
        .forEach((block) => {
          const heading = $('h2,h3', block);
          if (!heading) return;
          const lines = $$('.fx-line-in', heading);
          const label = $('.section-label', block);
          const rest = $$(':scope p', block).filter((p) => !p.closest('.fx-line'));
          const tl = gsap.timeline({ scrollTrigger: { trigger: block, start: 'top 84%', once: true } });
          if (label) tl.from(label, { opacity: 0, x: -22, duration: 0.6, ease: 'power2.out' }, 0);
          if (lines.length) tl.from(lines, { yPercent: 112, duration: 1.05, ease: 'power4.out', stagger: 0.11 }, 0.05);
          if (rest.length)
            tl.from(
              rest,
              {
                opacity: 0,
                y: 22,
                filter: 'blur(8px)',
                duration: 0.9,
                ease: 'power2.out',
                stagger: 0.08,
                clearProps: 'transform,filter,opacity',
              },
              0.3,
            );
        });
      $$('.section-label')
        .filter(
          (el) =>
            outside(el) &&
            !el.closest('.sec-head,.check-copy,.tier-intro,.launch-intro,.bridge-layout,.footer-top'),
        )
        .forEach((el) =>
          gsap.from(el, {
            opacity: 0,
            x: -22,
            duration: 0.7,
            ease: 'power2.out',
            scrollTrigger: { trigger: el, start: 'top 88%', once: true },
          }),
        );

      /* ---- kartu dan baris: naik bertahap dengan kemiringan 3D ---- */
      const rise = (selector: string, vars: gsap.TweenVars = {}) => {
        const els = $$(selector).filter(outside);
        if (!els.length) return;
        hold(els);
        gsap.set(els, {
          opacity: 0,
          y: 64,
          rotateX: -16,
          transformPerspective: 1000,
          transformOrigin: '50% 100%',
          filter: 'blur(9px)',
          willChange: 'transform,opacity,filter',
        });
        ScrollTrigger.batch(els, {
          start: 'top 90%',
          once: true,
          onEnter: (batch) =>
            gsap.to(batch, {
              opacity: 1,
              y: 0,
              rotateX: 0,
              filter: 'blur(0px)',
              duration: 1,
              ease: 'power3.out',
              stagger: 0.11,
              overwrite: true,
              onComplete: release(batch),
              ...vars,
            }),
        });
      };
      rise('.feature');
      rise('.token-card');
      rise('.tier-card');
      rise('.proof-card');
      rise('.milestone', { stagger: 0.07 });
      rise('.grad-display,.contract-table-wrap');

      const slide = (selector: string, x = -26) =>
        $$(selector)
          .filter(outside)
          .forEach((group) => {
            const kids = Array.from(group.children);
            if (!kids.length) return;
            gsap.from(kids, {
              opacity: 0,
              x,
              duration: 0.7,
              ease: 'power2.out',
              stagger: 0.07,
              clearProps: 'transform,opacity',
              scrollTrigger: { trigger: group, start: 'top 88%', once: true },
            });
          });
      slide('.check-perks');
      slide('.steps-mini');
      slide('.bridge-callouts');
      slide('.proof-checks', 22);
      slide('.grad-steps', 30);
      slide('.contract-table tbody', -18);

      // Ilustrasi fitur menggambar dirinya sendiri.
      $$<SVGSVGElement>('.feature .art svg').forEach((svg) => {
        const strokes = $$<SVGGeometryElement>('path,circle,rect', svg).filter(
          (el) => !el.hasAttribute('stroke-dasharray') && el.getAttribute('stroke') && 'getTotalLength' in el,
        );
        strokes.forEach((el) => {
          const length = el.getTotalLength();
          el.style.strokeDasharray = String(length);
          el.style.strokeDashoffset = String(length);
        });
        gsap.to(strokes, {
          strokeDashoffset: 0,
          duration: 1.5,
          ease: 'power2.inOut',
          stagger: 0.09,
          delay: 0.25,
          scrollTrigger: { trigger: svg, start: 'top 88%', once: true },
          onComplete: () =>
            strokes.forEach((el) => {
              el.style.strokeDasharray = '';
              el.style.strokeDashoffset = '';
            }),
        });
      });

      /* ---- "ONE OF ONE IS NOT ENOUGH": dial fokus, vonis dicap ---- */
      const dial = $('.v3-dial-rings');
      if (dial) {
        const tl = gsap.timeline({ scrollTrigger: { trigger: '.v3-thesis', start: 'top 72%', once: true } });
        tl.from(dial, { opacity: 0, scale: 0.55, filter: 'blur(16px)', duration: 1.2, ease: 'power3.out', clearProps: 'transform,filter,opacity' }, 0)
          .from($('strong', dial), { opacity: 0, scale: 1.9, duration: 0.7, ease: 'power3.out', clearProps: 'transform,opacity' }, 0.35)
          .from($('b', dial), { opacity: 0, scale: 3, rotate: -14, duration: 0.5, ease: 'back.out(2.2)', clearProps: 'transform,opacity' }, 0.85)
          .from('.v3-dial-caption,.v3-thesis-side p', { opacity: 0, y: 16, duration: 0.7, stagger: 0.1, clearProps: 'transform,opacity' }, 0.2);
        gsap.fromTo(
          '.v3-thesis-ambience',
          { yPercent: -8 },
          { yPercent: 8, ease: 'none', scrollTrigger: { trigger: '.v3-thesis', start: 'top bottom', end: 'bottom top', scrub: true } },
        );
      }

      /* ---- arsitektur: stage 3D naik ke tempatnya ---- */
      const shell = $('#architectureShell');
      if (shell) {
        hold([shell]);
        gsap.fromTo(
          shell,
          { y: 110, scale: 0.93, opacity: 0.25 },
          { y: 0, scale: 1, opacity: 1, ease: 'none', scrollTrigger: { trigger: shell, start: 'top 98%', end: 'top 52%', scrub: 0.5 } },
        );
      }

      /* ---- XofN Check: terminal berayun masuk lalu rata ---- */
      const terminal = $('.terminal');
      if (terminal) {
        hold([terminal]);
        gsap.set(terminal, { transformPerspective: 1300, transformOrigin: '0% 50%' });
        gsap.fromTo(
          terminal,
          { rotateY: wide ? -26 : 0, rotateX: 9, x: wide ? 90 : 0, y: 50, opacity: 0 },
          { rotateY: 0, rotateX: 0, x: 0, y: 0, opacity: 1, ease: 'none', scrollTrigger: { trigger: terminal, start: 'top 96%', end: 'top 42%', scrub: 0.5 } },
        );
        gsap.from($$('.kv', terminal), {
          opacity: 0,
          y: 16,
          duration: 0.6,
          stagger: 0.08,
          clearProps: 'transform,opacity',
          scrollTrigger: { trigger: '.kv-grid', start: 'top 85%', once: true },
        });
      }

      /* ---- security: verifier menyala satu per satu ---- */
      const rig = $('#v3DvnRig');
      if (rig)
        gsap.from($$('.v3-dvn-core,.v3-verifier,.v3-dvn-code', rig), {
          opacity: 0,
          filter: 'blur(12px)',
          duration: 0.8,
          ease: 'power2.out',
          stagger: 0.14,
          clearProps: 'filter,opacity',
          scrollTrigger: { trigger: rig, start: 'top 78%', once: true },
        });

      /* ---- graduation: scroll menjalankan lima langkah (klik manual menahan 6 detik) ---- */
      const steps = $$<HTMLButtonElement>('.grad-step');
      const gradSection = $('#graduation');
      if (steps.length && gradSection) {
        let manualUntil = 0;
        let current = -1;
        let auto = false;
        const onManual = () => {
          if (!auto) manualUntil = performance.now() + 6000;
        };
        steps.forEach((button) => button.addEventListener('click', onManual));
        cleanups.push(() => steps.forEach((button) => button.removeEventListener('click', onManual)));
        ScrollTrigger.create({
          trigger: gradSection,
          start: 'top 55%',
          end: 'bottom 70%',
          onUpdate: (self) => {
            const index = Math.min(steps.length - 1, Math.floor(self.progress * steps.length));
            if (index === current || performance.now() < manualUntil) return;
            current = index;
            auto = true;
            steps[index]?.click();
            auto = false;
          },
        });
      }

      /* ---- launch + bridge: widget datang dari samping ---- */
      ['.launch-form', '.bridge-widget'].forEach((selector) => {
        const el = $(selector);
        if (!el) return;
        hold([el]);
        gsap.fromTo(
          el,
          { x: wide ? 70 : 0, y: wide ? 0 : 50, opacity: 0, filter: 'blur(10px)' },
          {
            x: 0,
            y: 0,
            opacity: 1,
            filter: 'blur(0px)',
            duration: 1.1,
            ease: 'power3.out',
            onComplete: release([el]),
            scrollTrigger: { trigger: el, start: 'top 86%', once: true },
          },
        );
      });
      gsap.from($$('.launch-form .form-row,.launch-form .form-group,.launch-form .form-note,.launch-form .form-submit'), {
        opacity: 0,
        y: 18,
        duration: 0.6,
        stagger: 0.06,
        delay: 0.25,
        clearProps: 'transform,opacity',
        scrollTrigger: { trigger: '.launch-form', start: 'top 86%', once: true },
      });

      /* ---- keluar section: konten defocus saat ditinggalkan ---- */
      $$(':scope > section.section')
        .filter((section) => section.id !== 'architecture')
        .forEach((section) => {
          const inner = $(':scope > .container', section);
          if (!inner) return;
          gsap.to(inner, {
            opacity: 0.3,
            filter: 'blur(7px)',
            scale: 0.985,
            ease: 'none',
            scrollTrigger: { trigger: section, start: 'bottom 34%', end: 'bottom top', scrub: true },
          });
        });

      /* ---- marquee: kecepatan scroll mempercepat strip ---- */
      const strips = $$('.marquee .track,.v3-transmission-track');
      let rate = 1;
      ScrollTrigger.create({
        onUpdate: (self) => {
          rate = 1 + Math.min(5, Math.abs(self.getVelocity()) / 420);
        },
      });
      const onTick = () => {
        rate += (1 - rate) * 0.06;
        strips.forEach((el) =>
          el.getAnimations().forEach((animation) => {
            animation.playbackRate = rate;
          }),
        );
      };
      gsap.ticker.add(onTick);
      cleanups.push(() => gsap.ticker.remove(onTick));

      /* ---- CTA penutup ---- */
      const cta = $('.footer-top');
      const ctaHeading = cta ? $('h2', cta) : null;
      if (cta && ctaHeading) {
        gsap.fromTo(
          ctaHeading,
          { scale: 0.78, opacity: 0, filter: 'blur(14px)', letterSpacing: '.02em' },
          { scale: 1, opacity: 1, filter: 'blur(0px)', letterSpacing: '-.085em', ease: 'none', scrollTrigger: { trigger: cta, start: 'top 88%', end: 'top 34%', scrub: 0.5 } },
        );
        gsap.from($$(':scope .container>p,:scope .container>div:last-child', cta), {
          opacity: 0,
          y: 26,
          duration: 0.8,
          stagger: 0.12,
          clearProps: 'transform,opacity',
          scrollTrigger: { trigger: cta, start: 'top 52%', once: true },
        });
      }
    }, main);

    // Posisi trigger dihitung ulang setiap kali tinggi halaman berubah: font selesai dimuat,
    // atau lapisan galaxy menyala dan mengubah section "inside the coin" menjadi 200vh.
    // Tanpa ini trigger memakai posisi lama dan section tampak buram di tempat yang salah.
    const refresh = () => ScrollTrigger.refresh();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let lastHeight = main.offsetHeight;
    const heightObserver = new ResizeObserver(() => {
      if (main.offsetHeight === lastHeight) return;
      lastHeight = main.offsetHeight;
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(refresh, 180);
    });
    heightObserver.observe(main);
    window.addEventListener('load', refresh);
    void document.fonts?.ready.then(refresh);
    cleanups.push(() => {
      heightObserver.disconnect();
      if (refreshTimer) clearTimeout(refreshTimer);
      window.removeEventListener('load', refresh);
    });

    return () => {
      cleanups.forEach((cleanup) => cleanup());
      context.revert();
      main.querySelectorAll('.fx-hold').forEach((el) => el.classList.remove('fx-hold'));
    };
  }, []);

  return null;
}
