# Asignación automática — decisión de producto

El cliente NO selecciona técnico. Selecciona opciones de servicios, cantidades, dirección y horario. El sistema muestra la cotización y, al aceptarla, asigna un proveedor automáticamente.

## Criterios obligatorios
1. Profesional verificado y habilitado.
2. Capacitado para TODOS los servicios seleccionados.
3. Disponible durante la franja solicitada.
4. Sin reservas solapadas.
5. Cobertura geográfica y distancia (pendiente de implementación).

## Flujo
- Precios fijos: subtotal automático -> aceptación del cliente -> selección transaccional de proveedor -> reserva -> confirmación.
- Precios variables: presupuesto preliminar -> evaluación/cotización definitiva -> aceptación del cliente -> selección y reserva automática del proveedor elegible.
- Si nadie está disponible: no confirmar asignación; ofrecer cambiar fecha/hora.

## Estado técnico
Se añadieron tablas de disponibilidad y reservas y un módulo transaccional de selección. AÚN NO está integrado al endpoint de confirmación, que sigue solicitando providerId; ese endpoint debe reemplazarse antes de uso real. No hay matching por distancia/cobertura, agenda UI, pruebas, migraciones ejecutadas ni despliegue. No modificar main ni Plazado.
