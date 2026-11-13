# Constructor de cotizaciones y asignación

## Experiencia del cliente
1. Seleccionar categoría y opciones de servicios, cada una con cantidad.
2. Ver desglose de subtotal y elementos sujetos a inspección.
3. Seleccionar profesional que ofrezca todos los servicios solicitados.
4. Confirmar dirección, fecha y presupuesto.
5. Reservar y asignar el profesional seleccionado en una transacción.

## Implementado como código no conectado
- 004_service_builder.sql: opciones, partidas, proveedor seleccionado y totales.
- app/service-builder.mjs: catálogo, vista previa y confirmación de opciones de precio fijo con asignación.

## Condiciones antes de publicar
- Adaptar sp_users a roles customer/provider y montar rutas en server.mjs.
- Garantizar una reserva única por franja horaria; la implementación actual bloquea el perfil del proveedor pero NO valida ni reserva disponibilidad de agenda.
- Validar direcciones, cobertura geográfica, permisos, estado del proveedor y aceptación explícita de cambios de precio.
- Para servicios que requieren cotización, implementar oferta del proveedor, aceptación del cliente y asignación posterior. El endpoint de confirmación rechaza estas opciones actualmente.
- Definir impuestos, cargos de desplazamiento, comisiones y pago; el subtotal no representa un total definitivo con impuestos.
- Tests de concurrencia, aislamiento, manipulación de precio, doble aceptación y regresión.
- No hay migración aplicada ni despliegue. No modificar main ni Plazado.
