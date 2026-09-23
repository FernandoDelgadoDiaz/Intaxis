# Agentic Pymes · Referentes externos de empresas agentic

**Fecha:** 23/09/2026  
**Estado:** investigación de referencia; no modifica por sí sola la visión ni autoriza nuevas capas.

## Regla de uso

Estos casos sirven para aprender de sistemas que ya operan negocios físicos o experimentos empresariales con agentes. No se copian funciones por analogía.

Toda idea derivada debe pasar por `PRODUCT_VISION.md`:

1. ¿reduce trabajo manual del propietario?;
2. ¿cierra o fortalece un loop real?;
3. ¿resuelve un bloqueo comprobado?;
4. ¿preserva el core genérico?;
5. ¿produce progreso verificable ahora?

La prioridad sigue siendo el loop real de Postres Experiencia.

---

## 1. Café SofIA · ADEN Business School

### Evidencia pública verificada

Fuente oficial:

- https://aden.org/elearning/2026/SOFIA/LAB/
- https://www.aden.org/elearning/2026/SOFIA/INSCRIPCION/

ADEN presenta Café SofIA como un **Agentic AI Lab** aplicado a un café real. La página oficial indica que:

- existe un café físico de autoservicio;
- la IA toma decisiones desde la propuesta de valor hasta la reposición;
- los participantes diseñan prompts, herramientas, límites y tablero;
- el sistema se construye, despliega y mide en producción;
- opera sobre clientes, stock y caja reales;
- el formato se desarrolla en Mendoza, Panamá y San José de Costa Rica.

La página oficial consultada no publica suficiente detalle técnico para reconstruir stack, memoria, orquestación, políticas, base de datos o dispatcher interno. Fuentes periodísticas mencionan una arquitectura multiagente, pero ese detalle debe tratarse como secundario mientras ADEN no publique la arquitectura técnica.

### Aprendizajes aplicables

- **Una identidad humana única:** el usuario/cliente no debería coordinar agentes individuales.
- **Tools + límites + medición:** la capacidad de actuar, la gobernanza y la observabilidad son tan importantes como el prompt.
- **Negocio físico simplificado:** el autoservicio reduce complejidad física y permite probar autonomía sobre una operación acotada.
- **Laboratorio vivo:** medir sobre ventas, stock y caja reales revela errores que una simulación no muestra.

### Implicación para Agentic Pymes

No requiere crear nuevos agentes. Refuerza la dirección actual:

`propietario → Director → especialistas necesarios → Mi Negocio → políticas → acciones → resultado`

Postres Experiencia debe cumplir el mismo principio de laboratorio vivo, pero con un objetivo comercial reutilizable para PyMEs, no sólo académico.

---

## 2. Andon Café · Mona

### Evidencia pública verificada

Fuentes oficiales:

- https://andonlabs.com/cafe
- https://andonlabs.com/blog/ai-cafe-stockholm
- https://andonlabs.com/blog/why-gemini-lost-money-andon-cafe

Andon Labs describe Andon Café, en Estocolmo, como un negocio real operado por Mona. El agente intervino en permisos, proveedores, contratación de baristas, pedidos y operación diaria.

El análisis de Andon del período con Gemini 3.1 Pro muestra un punto crítico para cualquier empresa agentic: **capacidad de actuar no equivale a capacidad de operar rentablemente**.

Andon reportó, entre otros problemas:

- gasto muy superior a ventas durante los primeros dos meses;
- sobrecompra de productos e insumos;
- compra de artículos que no correspondían a la demanda o al menú;
- faltantes simultáneos de ingredientes realmente necesarios;
- descuentos y acuerdos comerciales sin suficiente control económico;
- decisiones que no se adaptaban adecuadamente al feedback financiero real.

Al cambiar de modelo, el comportamiento cambió de forma material: el nuevo agente fue más conservador con el gasto, pero llegó a restringir demasiado la reposición. Esto muestra que una política empresarial crítica no debe depender solamente de la “personalidad económica” emergente del modelo.

### Aprendizajes aplicables

#### Estado estructurado > memoria conversacional

Un agente no debería recordar mentalmente si ya compró servilletas, pan o queso. Debe consultar estado estructurado:

`stock → consumo → demanda → pedidos abiertos → lead time → presupuesto → necesidad`

#### El LLM no reemplaza controles determinísticos

Para dinero, inventario, capacidad, fechas y compromisos:

`modelo propone → datos verifican → política delimita → código preflight → acción`

#### Autonomía económica gradual

Una acción de compra debe poder considerar:

- proveedor aprobado;
- stock actual;
- demanda/consumo;
- pedido abierto;
- límite monetario;
- riesgo;
- horario/lead time;
- capacidad real.

#### Resultado económico, no sólo ejecución

“Pedido enviado correctamente” es un resultado técnico. El resultado empresarial es si ese pedido produjo disponibilidad, ventas, margen o desperdicio razonable.

### Implicación para Agentic Pymes

Refuerza decisiones ya existentes:

- `Mi Negocio` como memoria estructurada;
- `autonomy_policies` para limitar acciones;
- `agent_action_requests` como ledger;
- preflight de receta/stock/capacidad;
- aprendizaje posterior basado en resultado observado.

No justifica crear ahora un nuevo subsistema. Sí justifica que ninguna autonomía económica amplia se habilite antes de tener medición real y límites comprobados.

---

## 3. Andon Market · Luna

### Evidencia pública verificada

Fuente oficial:

- https://andonlabs.com/market

Andon Market utiliza un agente principal persistente llamado Luna y subagentes. La publicación describe herramientas para:

- navegación web sandboxed mediante subagentes;
- investigación paralela de proveedores;
- espera temporal (`Wait`);
- email, internet, terminal, banca, ERP, cámaras y otras capacidades del entorno Andon.

Andon también describe problemas de contexto/memoria a largo plazo y la necesidad de descargar ciertas responsabilidades en agentes persistentes específicos.

### Aprendizajes aplicables

#### Workers temporales ≠ nuevos especialistas empresariales

Un especialista de Producción puede lanzar trabajos temporales paralelos para buscar proveedores sin crear otro rol permanente llamado “Agente Proveedor”.

Esto mantiene el equipo organizado por función empresarial.

#### Esperar/despertar es un patrón útil

Andon usa `Wait` para mantener agentes de larga duración. Agentic Pymes no necesita copiar un proceso LLM vivo permanentemente. Puede conseguir el comportamiento empresarial continuo mediante:

`evento persistido → wake-up → hidratar Mi Negocio → razonar/actuar → volver a inactividad`

Eso puede reducir dependencia de contexto largo y costo ocioso.

---

## 4. Pion · Andon Labs

### Evidencia pública verificada

Fuentes oficiales:

- https://andonlabs.com/pion
- https://andonlabs.com/blog/why-we-built-pion
- https://os.andonlabs.com/legal/terms
- https://os.andonlabs.com/legal/privacy

Pion está publicado como **research preview**. Andon lo describe como una plataforma donde agentes persistentes administran empresas continuamente, con acceso a herramientas empresariales como:

- terminal;
- browser;
- email;
- teléfono;
- banco;
- tarjetas.

La interfaz pública muestra un patrón de supervisión:

`propietario → Andonos → agente que opera la empresa`

Andonos recibe dirección de alto nivel y da actualizaciones al propietario, mientras el agente empresarial realiza la operación.

Pion registra actividad extensa de las sesiones y Andon declara que puede pausar/detener agentes o congelar actividad por seguridad. La empresa también identifica la monitorización automática como prioridad antes de ampliar despliegues autónomos.

### Comparación conceptual

| Tema | Pion / Andon | Agentic Pymes |
| --- | --- | --- |
| Interfaz del propietario | Andonos | Director |
| Agente empresarial | Persistente | Director + especialistas |
| Herramientas externas | Muy amplias | Aún limitadas |
| Operación continua | Sí | Dispatcher general pendiente |
| Memoria | Contexto/memoria de agentes + sistemas | `Mi Negocio` estructurado + sesión |
| Acción | Tooling amplio | acciones tipadas |
| Política previa | safety/monitoring del entorno | `autonomy_policies` determinísticas |
| Ledger | session/action records | `agent_action_requests` |
| Multi-negocio | objetivo general de Pion | `business_id` + RLS |
| Aprendizaje canónico | no publicado de forma equivalente | brecha explícita de producto |

### Qué inspira

- **Una sola superficie de dirección.** Mostrar empresa, objetivos, alertas, progreso y excepciones, no “agentes pensando”.
- **Agentes persistentes como comportamiento, no necesariamente como proceso siempre encendido.** Eventos pueden despertar ejecuciones con estado fresco.
- **Tools amplias con secretos aislados.** Un agente necesita la capacidad `crear_pago`, no el token del proveedor dentro de su contexto.
- **Workers/subagentes temporales para fan-out.** Útiles para búsquedas paralelas sin multiplicar roles empresariales.
- **Monitorización continua.** Además de controlar si una acción puede ejecutarse, hay que detectar si una secuencia de acciones empieza a desviarse.
- **Kill switch.** Debe existir capacidad operativa de detener autonomía si aparecen señales anómalas.

### Qué no copiar sin evidencia

- permitir que agentes reescriban libremente su gobernanza;
- crear agentes nuevos de negocio dinámicamente sin necesidad demostrada;
- depender de memoria LLM para stock, dinero, agenda o compromisos;
- dar acceso amplio a dinero/proveedores antes de tener límites, preflight, auditoría y outcome tracking;
- mantener modelos razonando de forma permanente si un enfoque event-driven resuelve la necesidad con menor costo/riesgo.

---

## 5. Patrones que quedan como referencia futura

Estos patrones se documentan pero **no son prioridad de implementación mientras el primer loop no esté validado**.

### A. Wake-up por eventos

Ya existe `business_events`. La evolución correcta es usarla como sistema nervioso común, no crear otro bus.

Ejemplo futuro:

`payment.paid → Director despierta → consulta pedido/receta/stock/capacidad → política → producción`

### B. Watchdog de autonomía

Complemento futuro del policy engine.

- Policy engine: **¿esta acción está permitida antes de ejecutarse?**
- Watchdog: **¿la conducta acumulada sigue siendo razonable mientras opera?**

Señales futuras posibles:

- gasto anómalo;
- compra repetida;
- proveedor nuevo no previsto;
- inventario excesivo;
- margen negativo repetido;
- demasiadas acciones similares;
- comunicaciones fuera de reglas;
- caída abrupta de caja.

No debe ser un noveno especialista de negocio; debería ser una capa de control/observabilidad.

### C. Secret isolation

Cuando lleguen conectores externos:

- el contexto del agente recibe capacidades y resultados;
- los adaptadores seguros poseen credenciales;
- el LLM no recibe secretos salvo que sea estrictamente indispensable.

### D. Resultados empresariales

Todo tool/action necesita separar:

1. `resultado técnico`: se envió/creó/ejecutó correctamente;
2. `resultado empresarial`: qué cambió realmente en venta, margen, stock, satisfacción, tiempo o riesgo.

Esta separación alimenta el futuro mecanismo `MEDIR → APRENDER`.

---

## 6. Decisión actual después de estudiar estos casos

No se cambia la columna vertebral de Agentic Pymes.

La arquitectura objetivo sigue siendo:

`propietario → Director → Mi Negocio → evento/objetivo → especialistas necesarios → acción tipada → política determinística → ejecución → resultado → medición → aprendizaje`

Las referencias externas refuerzan especialmente cuatro principios ya presentes:

1. **estado empresarial estructurado antes que memoria LLM**;
2. **autonomía limitada por software y políticas, no sólo por prompt**;
3. **medir consecuencias reales en un negocio físico**;
4. **cerrar loops antes de agregar capacidades amplias**.

Próxima decisión técnica después del piloto, sólo si la evidencia lo justifica: convertir `business_events` en activación real del Director.

Hasta entonces, SofIA, Mona, Andon Market y Pion se mantienen como referentes de seguimiento, no como backlog automático.