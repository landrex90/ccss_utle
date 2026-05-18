interface Props {
  title: string
  message: string
}

export default function ClosingMessage({ title, message }: Props) {
  return (
    <div className="mt-8 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 hc-surface p-8 text-center animate-fade-in">
      <div className="w-14 h-14 bg-ccss-light rounded-full flex items-center justify-center mx-auto mb-5">
        <svg className="w-7 h-7 text-ccss-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-3">{title}</h2>
      <p className="text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-line">{message}</p>
    </div>
  )
}
