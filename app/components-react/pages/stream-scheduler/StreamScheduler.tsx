import React, { MouseEvent, useEffect, useMemo } from 'react';
import moment, { Moment } from 'moment';
import css from './StreamScheduler.m.less';
import cx from 'classnames';
import { Button, Calendar, Modal, Row, Col, Spin } from 'antd';
import { YoutubeEditStreamInfo } from '../../windows/go-live/platforms/YoutubeEditStreamInfo';
import { $t } from '../../../services/i18n';
import FacebookEditStreamInfo from '../../windows/go-live/platforms/FacebookEditStreamInfo';
import { ListInput, TimeInput } from '../../shared/inputs';
import Form, { useForm } from '../../shared/inputs/Form';
import { confirmAsync } from '../../modals';
import {
  IStreamEvent,
  StreamSchedulerController,
  StreamSchedulerCtx,
  useStreamScheduler,
} from './useStreamScheduler';
import Scrollable from '../../shared/Scrollable';
import { getDefined } from '../../../util/properties-type-guards';

/**
 * StreamScheduler page layout
 */
export default function StreamSchedulerPage() {
  const controller = useMemo(() => new StreamSchedulerController(), []);
  return (
    <StreamSchedulerCtx.Provider value={controller}>
      <StreamScheduler />
    </StreamSchedulerCtx.Provider>
  );
}
function StreamScheduler() {
  const { store } = useStreamScheduler();
  const isEventsLoaded = store.useState(s => s.isEventsLoaded);
  return (
    <Scrollable className={cx(css.streamSchedulerPage)}>
      <Spin tip="Loading..." spinning={!isEventsLoaded}>
        <SchedulerCalendar />
      </Spin>
      <EventSettingsModal />
    </Scrollable>
  );
}

/**
 * Calendar component
 */
function SchedulerCalendar() {
  const { showEditEventModal, showNewEventModal, store } = useStreamScheduler();
  const { selectedPlatform, events } = store.useState(s => ({
    selectedPlatform: s.selectedPlatform,
    events: s.events,
  }));
  /**
   * Renders a day cell in the calendar
   */
  function dateCellRender(date: Moment) {
    const start = moment(date).startOf('day');
    const end = moment(date).endOf('day');

    const dayEvents = events
      .filter(ev => {
        return moment(ev.date).isBetween(start, end);
      })
      .sort((ev1, ev2) => ev1.date - ev2.date);

    return (
      <div data-role="day" onClick={() => showNewEventModal(selectedPlatform, date.valueOf())}>
        {dayEvents.map(renderEvent)}
      </div>
    );
  }

  /**
   * Renders a single event
   */
  function renderEvent(event: IStreamEvent) {
    const time = moment(event.date).format('hh:mma');
    return (
      <p
        key={event.id}
        title={event.title}
        className={cx({
          [css.event]: true,
          [css.eventFacebook]: event.platform === 'facebook',
          [css.eventYoutube]: event.platform === 'youtube',
        })}
        onClick={ev => {
          ev.stopPropagation();
          showEditEventModal(event.id);
        }}
      >
        <span className={css.eventTime}>{time}</span> &nbsp;
        <span className={css.eventTitle}>{event.title}</span>
      </p>
    );
  }

  /**
   * Antd Calendar doesn't provide a good way for attaching a click event on the calendar's cell
   * So delegate the click event to the root div
   */
  function onCalendarClick(event: MouseEvent) {
    const $td = event.target!['closest']('td');
    if (!$td) return;
    $td.querySelector('[data-role="day"]')!['click']();
  }

  // define the date boundaries
  const minDate = moment().subtract(12, 'month');
  const maxDate = moment().add(1, 'month');

  // replace the "DD" cells format to a "D" format
  useEffect(() => {
    const $dayCells = document.querySelectorAll('.ant-picker-calendar-date-value');
    $dayCells.forEach(($cell: HTMLElement) => ($cell.innerText = String(Number($cell.innerText))));
  });

  return (
    <div onClick={onCalendarClick}>
      <Calendar dateCellRender={dateCellRender} validRange={[minDate, maxDate]} />
    </div>
  );
}

/**
 * A modal for creating/editing an event
 */
function EventSettingsModal() {
  const {
    submit,
    closeModal,
    setForm,
    getPlatformDisplayName,
    showNewEventModal,
    setTime,
    updatePlatform,
    platforms,
    isUpdateMode,
    store,
  } = useStreamScheduler();

  const {
    time,
    isModalVisible,
    isLoading,
    selectedPlatform,
    ytSettings,
    fbSettings,
  } = store.useState(s => ({
    time: s.time,
    isModalVisible: s.isModalVisible,
    isLoading: s.isLoading,
    selectedPlatform: s.selectedPlatform,
    ytSettings: getDefined(s.platformSettings.youtube),
    fbSettings: getDefined(s.platformSettings.facebook),
  }));

  // initialize the form
  const form = useForm();

  // make form accessible for the whole module
  setForm(form);

  // we only can change the platform when creating a new event
  const canChangePlatform = !isUpdateMode;

  // create a title with a legible date
  const formattedDate = moment(time).calendar();
  const title = isUpdateMode
    ? $t('Update Scheduled Stream for %{formattedDate}', { formattedDate })
    : $t('Schedule Stream for %{formattedDate}', { formattedDate });

  return (
    <Modal
      title={title}
      visible={isModalVisible}
      onOk={submit}
      onCancel={closeModal}
      afterClose={closeModal}
      destroyOnClose={true}
      footer={<ModalButtons />}
      getContainer={`.${css.streamSchedulerPage}`}
    >
      <Form form={form}>
        <Spin spinning={isLoading}>
          {/* PLATFORM SELECTOR */}
          {canChangePlatform && (
            <>
              <ListInput
                label={$t('Platform')}
                name="platform"
                value={selectedPlatform}
                options={platforms.map(platform => ({
                  value: platform,
                  label: getPlatformDisplayName(platform),
                }))}
                onChange={platform => showNewEventModal(platform)}
              />
              {selectedPlatform === 'facebook' && (
                <span className="whisper">
                  {$t(
                    'Please note that while you can schedule streams to Facebook, some will not appear on this calendar due to API limitations',
                  )}
                </span>
              )}
            </>
          )}

          {/* TIME PICKER */}
          <TimeInput name="time" label={$t('Time')} value={time} onChange={setTime} />

          {/* YOUTUBE SETTINGS */}
          {selectedPlatform === 'youtube' && (
            <YoutubeEditStreamInfo
              layoutMode="singlePlatform"
              isUpdateMode={isUpdateMode}
              isScheduleMode={true}
              value={ytSettings}
              onChange={newSettings => updatePlatform('youtube', newSettings)}
            />
          )}

          {/* FACEBOOK SETTINGS */}
          {selectedPlatform === 'facebook' && (
            <FacebookEditStreamInfo
              layoutMode="singlePlatform"
              isUpdateMode={isUpdateMode}
              isScheduleMode={true}
              value={fbSettings}
              onChange={newSettings => updatePlatform('facebook', newSettings)}
            />
          )}
        </Spin>
      </Form>
    </Modal>
  );
}

/**
 * Renders Schedule/Save/Delete buttons
 */
function ModalButtons() {
  const controller = useStreamScheduler();
  const { selectedEvent, remove, submit, goLive, primaryPlatform, store } = controller;
  const { isLoading } = store.useState(s => ({
    isLoading: s.isLoading,
  }));
  const shouldShowSave = !!selectedEvent;
  const shouldShowSchedule = !selectedEvent;
  const shouldShowGoLive =
    selectedEvent &&
    selectedEvent.platform === primaryPlatform &&
    selectedEvent.status === 'scheduled';

  // allow removing only those events which the user has not streamed to
  // removing the event with the finished stream leads to deletion of recorded video too
  const shouldShowRemove = selectedEvent && selectedEvent.status === 'scheduled';

  /**
   * confirm and delete
   */
  async function onDeleteClick() {
    if (await confirmAsync($t('Delete the event?'))) remove();
  }

  return (
    <Row>
      <Col flex={'50%'} style={{ textAlign: 'left' }}>
        {/* DELETE BUTTON */}
        {shouldShowRemove && (
          <Button danger onClick={onDeleteClick}>
            {$t('Delete')}
          </Button>
        )}
      </Col>
      <Col flex={'50%'}>
        {/* GO LIVE BUTTON */}
        {shouldShowGoLive && (
          <Button onClick={goLive} type="primary">
            {$t('Go Live')}
          </Button>
        )}

        {/* SAVE BUTTON */}
        {shouldShowSave && (
          <Button type="primary" onClick={submit} disabled={isLoading}>
            {$t('Save')}
          </Button>
        )}

        {/* SCHEDULE BUTTON */}
        {shouldShowSchedule && (
          <Button type="primary" onClick={submit} disabled={isLoading}>
            {$t('Schedule')}
          </Button>
        )}
      </Col>
    </Row>
  );
}
