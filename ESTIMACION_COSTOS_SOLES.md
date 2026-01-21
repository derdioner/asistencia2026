# Estimación de Costos Mensuales: ASISTENCIA QR (800 Estudiantes)
**Moneda: Soles Peruanos (S/.)**

Esta estimación asume el uso de **WhatChimp (Plan Básico)** y la **API Oficial de WhatsApp (Meta)**.

## 1. Costos Fijos (Plataforma WhatChimp)
*   **Suscripción Mensual:** $40 USD (aprox).
*   **En Soles:** ~S/. 150.00 al mes (T.C. ref 3.75).
*   *Incluye: Interfaz web, cero riesgo de bloqueo, multi-agente, mensajes ilimitados (la plataforma no cobra extra, cobra Meta).*

## 2. Costos Variables (Tarifas de Meta por Conversación)
Meta cobra por iniciar una "Conversación de 24 horas".
*   **Marketing (Avisos generales):** ~S/. 0.26 por conversación.
*   **Utilidad (Asistencias, Notas):** ~S/. 0.08 por conversación.

### Escenario A: Uso Típico (Asistencia Diaria)
*Supuesto: Cada estudiante recibe notificaciones de asistencia (Categoría: Utilidad).*

*   **Estudiantes:** 800
*   **Frecuencia:** 22 días de clases al mes.
*   **Cálculo:**
    *   Meta cobra **una vez cada 24 horas** por usuario, sin importar cuántos mensajes se envíen en ese día.
    *   Costo unitario Utilidad: S/. 0.08 (aprox).
    *   Total conversaciones: 800 alumnos * 22 días = 17,600 conversaciones.
*   **Costo Variable Mensual:** 17,600 * S/. 0.08 = **S/. 1,408.00**

### Escenario B: Uso Optimizado (Solo Faltas/Tardanzas)
*Supuesto: Solo se notifica cuando falta o llega tarde (digamos 10% de alumnos al día).*

*   **Estudiantes notificados:** ~80 al día.
*   Total conversaciones: 80 * 22 = 1,760 conversaciones.
*   **Costo Variable Mensual:** 1,760 * S/. 0.08 = **S/. 140.80**

### Escenario C: Comunicados Masivos (Marketing/Avisos)
*Supuesto: 1 comunicado mensual a todos los padres (reuniones, eventos).*

*   **Costo unitario Marketing:** S/. 0.26
*   Total: 800 * S/. 0.26 = **S/. 208.00** por envío masivo.

## Resumen Total Estimado (Mensual)

| Concepto | Costo Estimado (S/.) |
| :--- | :--- |
| **Plataforma (WhatChimp)** | **S/. 150.00** |
| **Consumo WhatsApp (Escenario A: Full Asistencia)** | S/. 1,408.00 |
| **TOTAL (Escenario A)** | **S/. 1,558.00 / mes** |
| | |
| **Consumo WhatsApp (Escenario B: Solo Faltas)** | S/. 140.80 |
| **TOTAL (Escenario B)** | **S/. 290.80 / mes** |

## Recomendación para Ahorrar
1.  **Priorizar Escenario B:** Notificar *solo* las excepciones (tardanzas/faltas) reduce el costo dramáticamente a ~S/. 300 mensuales.
2.  Las **primeras 1,000 conversaciones de servicio** (iniciadas por el padre, no por el bot) son **GRATIS** cada mes.

> **Nota:** Los precios de Meta pueden variar ligeramente por el tipo de cambio y actualizaciones de tarifas (cambio importante en Abril 2025 hacia cobro por mensaje).
