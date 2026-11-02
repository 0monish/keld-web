import { GYLDLAB } from "@/components/brand/GYLDLAB";
import { KELD } from "@/components/brand/KELD";

/** Static/SSR composition; only the two optional SVG shaders hydrate. */
export function FooterBrandLockup() {
  return (
    <div className="relative z-10 mx-auto w-[calc(100%-48px)] border-t border-white/12 pt-7 pb-7 text-[#9db1bf] sm:w-[calc(100%-64px)] xl:w-[min(1536px,calc(100%-112px))]">
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 text-[10px] font-semibold tracking-[0.2em] text-[#91aabb]">
        <span>KELD / A GYLDLAB PRODUCT</span>
        <span className="text-[#7191a5]">BUILT WITH PURPOSE</span>
      </div>

      <div className="flex flex-col items-center py-[clamp(70px,9vw,140px)] text-center">
        <p className="m-0 text-[10px] font-semibold tracking-[0.27em] text-[#b9d3df] uppercase sm:text-[11px]">
          ENGINEERED AND DESIGNED BY
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-x-[clamp(18px,3vw,52px)] gap-y-5 sm:flex-row sm:flex-wrap sm:gap-y-7">
          <a
            className="group inline-flex min-h-14 items-center gap-[clamp(12px,2vw,22px)] rounded-sm text-[#edf5f9] outline-offset-8 transition-colors duration-300 hover:text-white"
            href="https://gyldlab.com"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GYLDLAB — engineering and design studio, gyldlab.com"
          >
            <span className="relative block aspect-[2828/1773] w-[clamp(65px,8vw,116px)] shrink-0">
              <GYLDLAB />
            </span>
            <span className="text-[clamp(23px,3.9vw,58px)] leading-none font-medium tracking-[0.085em] whitespace-nowrap sm:tracking-[0.115em]">
              GYLDLAB
            </span>
          </a>

          <span
            className="select-none text-[clamp(24px,3vw,46px)] leading-none font-light text-[#7c9bae]"
            aria-hidden="true"
          >
            ×
          </span>

          <a
            className="group inline-flex min-h-14 items-center gap-[clamp(10px,1.7vw,20px)] rounded-sm text-[#edf5f9] outline-offset-8 transition-colors duration-300 hover:text-white"
            href="https://github.com/gyldlab/keld"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="KELD — open-source desktop framework"
          >
            <span className="relative block aspect-[900/680] w-[clamp(52px,6.5vw,90px)] shrink-0">
              <KELD />
            </span>
            <span className="text-[clamp(23px,4vw,61px)] leading-none font-medium tracking-[0.18em] whitespace-nowrap sm:tracking-[0.22em]">
              KELD
            </span>
          </a>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-white/12 pt-6 text-[9px] font-semibold tracking-[0.19em] text-[#829aa9]">
        <span>INTENT IN EVERY DETAIL.</span>
        <span>DESIGNED TO BUILD WHAT&apos;S NEXT.</span>
      </div>
    </div>
  );
}
