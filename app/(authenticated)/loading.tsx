export default function Loading() {
  return (
    <div className="w-full h-full flex items-center justify-center p-12">
      <div className="flex flex-col items-center space-y-4">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-gray-500 font-medium animate-pulse">Carregando...</p>
      </div>
    </div>
  );
}
