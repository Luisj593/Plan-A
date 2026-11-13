# ServicioPro

SaaS multiempresa para empresas de servicios técnicos. Desarrollo aislado en `feature/serviciopro`.

## Alcance del MVP
- Empresas y sucursales
- Usuarios y roles (superadmin, administrador, supervisor, técnico)
- Clientes y ubicaciones
- Órdenes de trabajo con estados y asignaciones
- Cotizaciones y líneas de materiales/mano de obra
- Evidencias y bitácora de cambios
- Cobros y reportes (fase posterior)

## Reglas
- Ningún cambio automático a main o despliegues de Railway.
- Cada tabla de negocio pertenece a una empresa (tenant_id).
- Toda consulta y mutación debe comprobar tenant_id y permisos del usuario en servidor.
- Datos persistentes en PostgreSQL, nunca solo en memoria.
- Las migraciones requieren revisión antes de ejecutarse.

## Siguiente fase
Implementar API, autenticación, migraciones y pruebas de aislamiento antes de conectar Railway.
