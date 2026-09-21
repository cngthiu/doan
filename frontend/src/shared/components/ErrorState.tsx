export function ErrorState({ message }: { message: string }) {
  return (
    <div className="error-state" role="alert">
      {message}
    </div>
  )
}
