# ServicioPro — Marketplace de servicios a domicilio

## Producto
Marketplace tipo Uber para contratación de servicios de hogar y negocios en República Dominicana. El MVP previo de gestión empresarial es un prototipo técnico, **no** la arquitectura final del marketplace.

## Perfiles
- Cliente: registro, direcciones, solicitud, agenda, seguimiento, pago, reseña.
- Profesional independiente: identidad y documentos, especialidades, zona de cobertura, disponibilidad, aceptación, evidencias, saldo.
- Empresa proveedora: técnicos propios, asignación, catálogo, cumplimiento y facturación.
- Superadministrador: validación de profesionales, categorías, tarifas, comisiones, disputas, reembolsos y auditoría.

## Categorías iniciales
Electricidad; plomería; limpieza de hogares; organización de clósets; pintura; mantenimiento de aires acondicionados; carpintería; ensamblaje de muebles.

## Ciclo de solicitud
draft -> requested -> offered -> accepted -> en_route -> arrived -> in_progress -> completed -> confirmed.
Rutas alternas: cancelled, disputed, refunded. Las transiciones se validan en servidor y se auditan.

## Precio y pagos
- Precio fijo por servicio estandarizado o cotización aceptada antes de iniciar.
- Mostrar subtotal, desplazamiento si aplica, comisión de plataforma e impuestos según corresponda antes de confirmar.
- Cobros centralizados mediante proveedor de pagos autorizado; no almacenar números de tarjeta.
- Liberación de pagos al profesional después de confirmar prestación y reglas de disputa.
- Reembolsos, cancelaciones y liquidaciones trazables, con conciliación por webhook firmado e idempotente.

## Asignación
- Filtrar por especialidad, zona, disponibilidad, estado verificado y elegibilidad.
- Ofertas con expiración y aceptación atómica para evitar doble asignación.
- Ubicación en tiempo real solo con consentimiento, durante un servicio activo.
- No prometer ETA sin proveedor de mapas y rutas configurado.

## Seguridad y privacidad
- Autenticación con roles y controles de acceso por recurso.
- Documentos de identidad en almacenamiento privado con acceso temporal y registro de consultas.
- Verificación y aprobación de profesionales antes de aceptar trabajos.
- Ubicación de cliente compartida solo con proveedor asignado y durante la prestación.
- Evidencias y mensajes protegidos, retención definida, protección contra fraude.
- Datos de Plazado y su infraestructura completamente separados.

## Persistencia propuesta
users, customer_profiles, provider_profiles, provider_companies, company_members,
categories, services, provider_services, service_areas, addresses,
availability_slots, service_requests, request_photos, job_offers, assignments,
job_status_events, quotes, quote_lines, payments, payment_events,
provider_balances, payouts, reviews, disputes, notifications, audit_logs.
Usar PostgreSQL propio y migraciones revisadas; índices geoespaciales PostGIS si se adopta búsqueda por radio.

## Fases
1. Registro de cliente/profesional, catálogo, solicitud, cotización, aceptación, agenda, estados y panel admin.
2. Mapas y geolocalización, notificaciones, reseñas, verificación documental.
3. Pagos reales, comisiones, liquidaciones, reembolsos y conciliación.
4. App móvil, automatización inteligente y expansión geográfica.

## Restricción de despliegue
Trabajar únicamente en feature/serviciopro. No modificar main, NEXXUS ni ninguna base, bucket o despliegue de Plazado sin autorización expresa.
