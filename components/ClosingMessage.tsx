interface Props {
  title: string
  message: string
  highlight?: string
}

export default function ClosingMessage({ title, message, highlight }: Props) {
  return (
    <div className="mt-8 bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center animate-fade-in">
      <div className="w-14 h-14 bg-ccss-light rounded-full flex items-center justify-center mx-auto mb-5">
        <svg className="w-7 h-7 text-ccss-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-gray-800 mb-3">{title}</h2>
      <p className="text-gray-600 leading-relaxed whitespace-pre-line">{message}</p>
      {highlight && (
        <p className="mt-5 text-ccss-primary font-semibold text-lg">{highlight}</p>
      )}
    </div>
  )
}
