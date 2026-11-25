export function BrandMark({ size = 20 }) {
  return (
    <svg
      aria-hidden='true'
      width={size}
      height={size}
      viewBox='0 0 32 32'
      fill='none'
    >
      <path
        d='M16 3.8 26 9.5v13L16 28.2 6 22.5v-13L16 3.8Z'
        stroke='currentColor'
        strokeWidth='1.6'
        strokeLinejoin='round'
      />
      <path
        d='M11 11.5h10L11 20.5h10'
        stroke='currentColor'
        strokeWidth='2.4'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    </svg>
  )
}
