/** Error de la capa de acceso a datos: la UI lo muestra con ErrorState sin exponer detalles internos. */
export class DataAccessError extends Error {
  override name = "DataAccessError";
  constructor(
    message: string,
    readonly operation: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}
