# Estado de implementación — marketplace mixto

## Incorporado en rama feature/serviciopro
- Migración SQL de catálogo, proveedores, solicitudes, cotizaciones, asignaciones y eventos.
- Restricción SQL de precios: fixed requiere precio; quote requiere precio nulo.
- Router de API para catálogo, solicitudes, cotización y aceptación transaccional.

## Integración pendiente y bloqueantes
- El router marketplace.mjs NO está montado todavía en server.mjs.
- El esquema previo sp_users usa roles admin/supervisor/technician; se necesita migración de identidad y roles customer/provider y autenticación adecuada antes de activar el router.
- Verificar autorización de proveedor por solicitud, alcance de ubicación y acceso a datos personales.
- Implementar aceptación de precio fijo, cancelación, pagos, reembolsos, verificación documental y protección antifraude.
- Añadir pruebas automáticas y migraciones seguras, incluyendo idempotencia y concurrencia.
- No ejecutar 003_marketplace.sql sobre Plazado ni sobre ninguna base de producción.
- Sin despliegue ni modificación a main.
