import type { Metadata } from 'next'
import s from './faq.module.css'

export const metadata: Metadata = {
  title: 'Preguntas frecuentes — CLEO CCSS',
  description:
    'Respuestas a las preguntas más frecuentes sobre el correo de verificación de lista de espera enviado por la UTLE de la CCSS.',
  robots: 'noindex, nofollow',
}

const CONTACT = 'gm_utle_gelisespera@ccss.sa.cr'

function ContactLink() {
  return <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
}

export default function FaqPage() {
  return (
    <div className={s.page}>
      {/* ── Header ── */}
      <header className={s.hd}>
        <div className={s.hdInner}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={s.hdLogo} src="/logos/ccss-logo-nuevo.png" alt="CCSS Seguro Social Costa Rica" />
          <div className={s.hdCenter}>
            <div className={s.hdEyebrow}>Caja Costarricense de Seguro Social · UTLE</div>
            <h1 className={s.hdTitle}>
              Preguntas frecuentes<br />sobre el correo que recibió
            </h1>
            <p className={s.hdSub}>
              Si tiene dudas sobre el mensaje que le enviamos, aquí encontrará respuestas claras.
            </p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={s.hdCleo} src="/logos/cleo-robot.jpg" alt="CLEO — Asistente CCSS" />
        </div>
      </header>

      {/* ── Contact bar ── */}
      <div className={s.contactBar}>
        <span>✉️</span>
        <span>
          ¿No encuentra su pregunta aquí? Escríbanos a <ContactLink />
        </span>
      </div>

      {/* ── Content ── */}
      <main className={s.main}>

        {/* ── Categoría 1: Sobre el correo ── */}
        <div className={s.cat}>
          <div className={`${s.catTitle} ${s.c1}`}>
            <span>📩</span> Sobre el correo que recibió
          </div>

          <details className={`${s.faq} ${s.c1}`}>
            <summary className={s.faqQ}>
              <span className={s.faqIcon}>?</span>
              <span className={s.faqLabel}>No recuerdo haber pedido ninguna cita — ¿por qué me llegó este correo?</span>
              <span className={s.faqChev}>▼</span>
            </summary>
            <div className={s.faqAns}>
              <p>Su nombre figura en la Lista de Espera de la CCSS para recibir atención médica especializada. Es posible que la solicitud la haya gestionado su médico de EBAIS o en una consulta previa, y que haya pasado algún tiempo desde entonces.</p>
              <p>Este correo es una verificación: queremos confirmar que usted sigue necesitando la atención y que sus datos de contacto siguen siendo correctos.</p>
            </div>
          </details>

          <details className={`${s.faq} ${s.c1}`}>
            <summary className={s.faqQ}>
              <span className={s.faqIcon}>?</span>
              <span className={s.faqLabel}>¿Este correo es real o es un fraude? No confío en el enlace.</span>
              <span className={s.faqChev}>▼</span>
            </summary>
            <div className={s.faqAns}>
              <p>Su desconfianza es completamente válida. Este correo fue enviado oficialmente por la Unidad de Tratamiento y Listas de Espera (UTLE) de la CCSS.</p>
              <p>Señales de que es legítimo:</p>
              <ul>
                <li>No le pedimos ninguna contraseña, número de tarjeta ni dato bancario.</li>
                <li>El enlace solo le pide confirmar si desea seguir en la lista.</li>
                <li>Puede verificarlo escribiendo a <strong>{CONTACT}</strong> antes de hacer clic en nada.</li>
              </ul>
              <div className={s.action}>Si prefiere no usar el enlace, puede responder directamente a este correo y registramos su confirmación.</div>
            </div>
          </details>

          <details className={`${s.faq} ${s.c1}`}>
            <summary className={s.faqQ}>
              <span className={s.faqIcon}>?</span>
              <span className={s.faqLabel}>¿Qué es CLEO? Yo tengo expediente en la CCSS, no en ningún CLEO.</span>
              <span className={s.faqChev}>▼</span>
            </summary>
            <div className={s.faqAns}>
              <p>CLEO es el nombre del sistema digital que la CCSS usa para comunicarse con los pacientes en lista de espera. No es una empresa ni institución externa.</p>
              <p>Su expediente, su aseguramiento y toda la información que comparte siguen siendo parte de los registros oficiales de la Caja Costarricense de Seguro Social.</p>
            </div>
          </details>

          <details className={`${s.faq} ${s.c1}`}>
            <summary className={s.faqQ}>
              <span className={s.faqIcon}>?</span>
              <span className={s.faqLabel}>¿Qué es la depuración de la lista de espera?</span>
              <span className={s.faqChev}>▼</span>
            </summary>
            <div className={s.faqAns}>
              <p>Es un proceso periódico en el que la CCSS revisa las listas de espera para verificar que la información de contacto esté actualizada y que la persona usuaria continúe necesitando o deseando la atención indicada.</p>
              <p>Como parte de este proceso se realizan contactos por correo electrónico, teléfono u otros medios. Si no es posible localizar a la persona tras los intentos establecidos, el caso podría ser depurado conforme a los procedimientos institucionales vigentes.</p>
            </div>
          </details>
        </div>

        {/* ── Categoría 2: Lista de espera ── */}
        <div className={s.cat}>
          <div className={`${s.catTitle} ${s.c2}`}>
            <span>📋</span> Su lugar en la lista de espera
          </div>

          <details className={`${s.faq} ${s.c2}`}>
            <summary className={s.faqQ}>
              <span className={s.faqIcon}>?</span>
              <span className={s.faqLabel}>¿Para qué especialidad o procedimiento es este mensaje? Tengo varias citas en la CCSS.</span>
              <span className={s.faqChev}>▼</span>
            </summary>
            <div className={s.faqAns}>
              <p>El correo que le enviamos indica el procedimiento o especialidad al que corresponde. Le recomendamos revisarlo nuevamente.</p>
              <div className={s.action}>Si no quedó claro, escríbanos a <ContactLink /> con su número de cédula y le confirmamos el detalle.</div>
            </div>
          </details>

          <details className={`${s.faq} ${s.c2}`}>
            <summary className={s.faqQ}>
              <span className={s.faqIcon}>?</span>
              <span className={s.faqLabel}>¿Cuánto tiempo más voy a tener que esperar para ser atendido?</span>
              <span className={s.faqChev}>▼</span>
            </summary>
            <div className={s.faqAns}>
              <p>El tiempo de espera depende de múltiples factores: la especialidad, la prioridad clínica del caso y la disponibilidad de recursos para la atención. Por eso no es posible garantizar una fecha específica hasta que la atención sea programada formalmente.</p>
              <div className={s.action}>Para consultar el estado de su caso, comuníquese con el servicio especializado o con su médico de referencia en el hospital.</div>
            </div>
          </details>

          <details className={`${s.faq} ${s.c2}`}>
            <summary className={s.faqQ}>
              <span className={s.faqIcon}>?</span>
              <span className={s.faqLabel}>¿Cómo sé en qué posición estoy en la lista de espera?</span>
              <span className={s.faqChev}>▼</span>
            </summary>
            <div className={s.faqAns}>
              <p>La posición se determina con base en la fecha de indicación médica y la prioridad clínica del caso, por lo que no corresponde a un estricto orden de llegada.</p>
              <div className={s.action}>Puede consultar el estado de su caso en el servicio correspondiente o durante su próxima cita de control con el especialista.</div>
            </div>
          </details>

          <details className={`${s.faq} ${s.c2}`}>
            <summary className={s.faqQ}>
              <span className={s.faqIcon}>?</span>
              <span className={s.faqLabel}>Me llamaron o me enviaron un mensaje y no pude atender — ¿pierdo mi lugar?</span>
              <span className={s.faqChev}>▼</span>
            </summary>
            <div className={s.faqAns}>
              <p>No se pierde de forma inmediata. Sin embargo, el registro puede quedar clasificado como no localizado. Si tras todos los intentos de contacto establecidos no es posible ubicarle, el caso podría ser depurado de la lista de espera.</p>
              <div className={s.action}>Si sabe que intentaron contactarle, escríbanos a <ContactLink /> con su número de cédula para registrar su respuesta.</div>
            </div>
          </details>

          <details className={`${s.faq} ${s.c2}`}>
            <summary className={s.faqQ}>
              <span className={s.faqIcon}>?</span>
              <span className={s.faqLabel}>Mi condición de salud empeoró — ¿puedo pedir que me den prioridad?</span>
              <span className={s.faqChev}>▼</span>
            </summary>
            <div className={s.faqAns}>
              <p>Sí. Debe solicitar una valoración con su médico tratante, quien determinará si existe un cambio clínico que justifique una modificación en la prioridad asignada. Esta decisión corresponde a un criterio médico, no administrativo.</p>
              <div className={s.action}>Comuníquese con su médico de EBAIS o el especialista de referencia para iniciar esa valoración.</div>
            </div>
          </details>

          <details className={`${s.faq} ${s.c2}`}>
            <summary className={s.faqQ}>
              <span className={s.faqIcon}>?</span>
              <span className={s.faqLabel}>¿Qué pasa si no respondo el correo?</span>
              <span className={s.faqChev}>▼</span>
            </summary>
            <div className={s.faqAns}>
              <p>Le recomendamos responder dentro del plazo indicado. Si no recibimos confirmación, su registro podría quedar marcado sin respuesta en este proceso de actualización, lo que puede afectar su posición en la lista.</p>
              <div className={s.action}>Si ya pasó el plazo, escríbanos a <ContactLink /> y buscamos la forma de registrar su confirmación.</div>
            </div>
          </details>

          <details className={`${s.faq} ${s.c2}`}>
            <summary className={s.faqQ}>
              <span className={s.faqIcon}>?</span>
              <span className={s.faqLabel}>Respondí el formulario pero no sé si quedó guardado.</span>
              <span className={s.faqChev}>▼</span>
            </summary>
            <div className={s.faqAns}>
              <p>Si al terminar el formulario apareció un mensaje de confirmación en la pantalla, su respuesta quedó registrada correctamente.</p>
              <div className={s.action}>Si no vio ese mensaje, escríbanos con su número de cédula a <ContactLink /> y verificamos.</div>
            </div>
          </details>
        </div>

        {/* ── Categoría 3: Ya fue atendido ── */}
        <div className={s.cat}>
          <div className={`${s.catTitle} ${s.c3}`}>
            <span>✅</span> Si ya fue atendido o desea salir de la lista
          </div>

          <details className={`${s.faq} ${s.c3}`}>
            <summary className={s.faqQ}>
              <span className={s.faqIcon}>?</span>
              <span className={s.faqLabel}>Ya me operaron o ya me atendieron — ¿qué hago?</span>
              <span className={s.faqChev}>▼</span>
            </summary>
            <div className={s.faqAns}>
              <p>Es posible que su atención haya ocurrido después de la fecha de corte del registro, por eso su nombre sigue apareciendo en la lista.</p>
              <div className={s.action}>Escríbanos a <ContactLink /> con su número de cédula, la fecha aproximada de su atención y el hospital donde fue atendido. Actualizamos su expediente de inmediato.</div>
            </div>
          </details>

          <details className={`${s.faq} ${s.c3}`}>
            <summary className={s.faqQ}>
              <span className={s.faqIcon}>?</span>
              <span className={s.faqLabel}>Ya no necesito la cita — me atendí por cuenta propia o en el extranjero.</span>
              <span className={s.faqChev}>▼</span>
            </summary>
            <div className={s.faqAns}>
              <p>Puede retirarse voluntariamente de la lista en cualquier momento, sin ningún trámite complicado.</p>
              <div className={s.action}>Escríbanos a <ContactLink /> con su número de cédula e indíquenos el motivo. Lo procesamos de inmediato.</div>
            </div>
          </details>

          <details className={`${s.faq} ${s.c3}`}>
            <summary className={s.faqQ}>
              <span className={s.faqIcon}>?</span>
              <span className={s.faqLabel}>Me equivoqué al responder — ¿puedo cambiar lo que envié?</span>
              <span className={s.faqChev}>▼</span>
            </summary>
            <div className={s.faqAns}>
              <div className={s.action}>Escríbanos a <ContactLink /> con su número de cédula e indíquenos la respuesta correcta. Lo ajustamos sin problema.</div>
            </div>
          </details>
        </div>

        {/* ── Categoría 4: Actualizar datos ── */}
        <div className={s.cat}>
          <div className={`${s.catTitle} ${s.c4}`}>
            <span>📝</span> Actualizar sus datos de contacto
          </div>

          <details className={`${s.faq} ${s.c4}`}>
            <summary className={s.faqQ}>
              <span className={s.faqIcon}>?</span>
              <span className={s.faqLabel}>Cambié de correo electrónico — ¿cómo lo actualizo?</span>
              <span className={s.faqChev}>▼</span>
            </summary>
            <div className={s.faqAns}>
              <div className={s.action}>Escríbanos a <ContactLink /> con su número de cédula y su nuevo correo electrónico. Lo actualizamos para futuras comunicaciones.</div>
            </div>
          </details>

          <details className={`${s.faq} ${s.c4}`}>
            <summary className={s.faqQ}>
              <span className={s.faqIcon}>?</span>
              <span className={s.faqLabel}>Mi número de teléfono cambió.</span>
              <span className={s.faqChev}>▼</span>
            </summary>
            <div className={s.faqAns}>
              <div className={s.action}>Escríbanos a <ContactLink /> con su número de cédula y su nuevo número de teléfono. Realizamos el cambio en su registro.</div>
            </div>
          </details>

          <details className={`${s.faq} ${s.c4}`}>
            <summary className={s.faqQ}>
              <span className={s.faqIcon}>?</span>
              <span className={s.faqLabel}>Los datos que aparecen en el correo no son correctos.</span>
              <span className={s.faqChev}>▼</span>
            </summary>
            <div className={s.faqAns}>
              <div className={s.action}>Escríbanos a <ContactLink /> con su número de cédula, el dato incorrecto y el correcto. Revisamos y le confirmamos el ajuste.</div>
            </div>
          </details>
        </div>

        {/* ── Categoría 5: Problemas con el enlace ── */}
        <div className={s.cat}>
          <div className={`${s.catTitle} ${s.c5}`}>
            <span>🔗</span> Problemas con el enlace o el formulario
          </div>

          <details className={`${s.faq} ${s.c5}`}>
            <summary className={s.faqQ}>
              <span className={s.faqIcon}>?</span>
              <span className={s.faqLabel}>El enlace no me funciona o dice que ya venció.</span>
              <span className={s.faqChev}>▼</span>
            </summary>
            <div className={s.faqAns}>
              <p>Los enlaces tienen una vigencia limitada por razones de seguridad. Si el suyo ya expiró, no se preocupe.</p>
              <div className={s.action}>Escríbanos a <ContactLink /> con su número de cédula y le enviamos un nuevo enlace. También puede confirmar respondiendo directamente ese correo.</div>
            </div>
          </details>

          <details className={`${s.faq} ${s.c5}`}>
            <summary className={s.faqQ}>
              <span className={s.faqIcon}>?</span>
              <span className={s.faqLabel}>No tengo internet o no sé usar la computadora — ¿hay otra forma?</span>
              <span className={s.faqChev}>▼</span>
            </summary>
            <div className={s.faqAns}>
              <p>Puede apersonarse directamente al <strong>Hospital Dr. Rafael Ángel Calderón Guardia</strong>, en la Unidad de Tratamiento y Listas de Espera (UTLE), con su cédula de identidad. Un funcionario registra su respuesta en ese momento.</p>
              <div className={s.action}>También puede pedirle a un familiar o persona de confianza que le ayude a responder el formulario desde el teléfono o computadora de ellos.</div>
            </div>
          </details>
        </div>

        {/* ── Categoría 6: Situaciones especiales ── */}
        <div className={s.cat}>
          <div className={`${s.catTitle} ${s.c6}`}>
            <span>👥</span> Situaciones especiales
          </div>

          <details className={`${s.faq} ${s.c6}`}>
            <summary className={s.faqQ}>
              <span className={s.faqIcon}>?</span>
              <span className={s.faqLabel}>El paciente falleció — soy un familiar y quiero notificarlo.</span>
              <span className={s.faqChev}>▼</span>
            </summary>
            <div className={s.faqAns}>
              <p>Lamentamos su pérdida.</p>
              <div className={s.action}>Escríbanos a <ContactLink /> con el número de cédula del asegurado y la fecha aproximada del fallecimiento. No necesita ningún documento adicional. Actualizamos el registro de inmediato.</div>
            </div>
          </details>

          <details className={`${s.faq} ${s.c6}`}>
            <summary className={s.faqQ}>
              <span className={s.faqIcon}>?</span>
              <span className={s.faqLabel}>Soy el encargado de un menor de edad — ¿puedo responder en su nombre?</span>
              <span className={s.faqChev}>▼</span>
            </summary>
            <div className={s.faqAns}>
              <p>Sí. Como padre, madre o encargado legal puede responder en nombre del menor. Solo indíquenos su nombre y relación con el paciente.</p>
              <div className={s.action}>Si tuvo dificultad con el formulario, escríbanos a <ContactLink /> indicando que representa al menor y lo registramos manualmente.</div>
            </div>
          </details>

          <details className={`${s.faq} ${s.c6}`}>
            <summary className={s.faqQ}>
              <span className={s.faqIcon}>?</span>
              <span className={s.faqLabel}>Me cambié de EBAIS o de área de salud — ¿afecta mi lugar en la lista?</span>
              <span className={s.faqChev}>▼</span>
            </summary>
            <div className={s.faqAns}>
              <p>En principio el cambio de EBAIS no elimina su registro de la lista. Sin embargo, es importante actualizar sus datos de contacto para evitar dificultades para localizarle. Si su médico de referencia también cambió, notifíquelo para que coordinen el traslado del expediente.</p>
              <div className={s.action}>Avise directamente en el hospital o EBAIS de referencia original y actualice sus datos con nosotros escribiendo a <ContactLink />.</div>
            </div>
          </details>

          <details className={`${s.faq} ${s.c6}`}>
            <summary className={s.faqQ}>
              <span className={s.faqIcon}>?</span>
              <span className={s.faqLabel}>¿Puedo pedir que me operen en otro hospital para que sea más rápido?</span>
              <span className={s.faqChev}>▼</span>
            </summary>
            <div className={s.faqAns}>
              <p>En determinados casos puede existir la posibilidad de referencia a otro establecimiento con menor lista de espera, sujeto a valoración médica y disponibilidad institucional.</p>
              <div className={s.action}>Esta opción debe ser analizada por su médico tratante y el servicio correspondiente. Consúltela directamente con ellos.</div>
            </div>
          </details>

          <details className={`${s.faq} ${s.c6}`}>
            <summary className={s.faqQ}>
              <span className={s.faqIcon}>?</span>
              <span className={s.faqLabel}>¿Qué es un recurso de amparo y cuándo puedo presentarlo?</span>
              <span className={s.faqChev}>▼</span>
            </summary>
            <div className={s.faqAns}>
              <p>Es una gestión que puede presentarse ante la Sala Constitucional cuando una persona considera que se está vulnerando su derecho a la salud. Antes de acudir a esa vía se recomienda agotar las gestiones administrativas disponibles.</p>
              <div className={s.action}>Si considera que su situación requiere atención urgente, consulte primero con el servicio de trabajo social del hospital o con la Oficina de Atención Oportuna a las Personas (OAOP).</div>
            </div>
          </details>

          <details className={`${s.faq} ${s.c6}`}>
            <summary className={s.faqQ}>
              <span className={s.faqIcon}>?</span>
              <span className={s.faqLabel}>¿A quién puedo contactar si tengo dudas específicas sobre mi caso?</span>
              <span className={s.faqChev}>▼</span>
            </summary>
            <div className={s.faqAns}>
              <p>Depende del tipo de consulta:</p>
              <ul>
                <li><strong>Dudas sobre este correo o el formulario:</strong> escríbanos a <ContactLink /></li>
                <li><strong>Inconsistencias en la lista o actualización de datos:</strong> Oficina de Atención Oportuna a las Personas (OAOP) del Hospital Calderón Guardia.</li>
                <li><strong>Cambio en estado clínico o prioridad:</strong> su médico tratante o el servicio especializado de referencia.</li>
              </ul>
            </div>
          </details>
        </div>

        {/* ── Bottom card ── */}
        <div className={s.bottomCard}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={s.bottomCardCleo} src="/logos/cleo-robot.jpg" alt="CLEO" />
          <div className={s.bottomCardBody}>
            <h2>¿No encontró su respuesta?</h2>
            <p>Escríbanos con su consulta y número de cédula — le respondemos a la brevedad.</p>
            <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
          </div>
        </div>

      </main>
    </div>
  )
}
