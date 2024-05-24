create table modules
(
    code                    text PRIMARY KEY NOT NULL,
    campus                  text             NOT NULL,
    title                   text             NOT NULL,
    year                    text             NOT NULL,
    credits                 int              NOT NULL,
    level                   int              NOT NULL,
    school                  text             NOT NULL,
    semesters               text             NOT NULL,
    summary                 text             NOT NULL,
    target_students         text             NOT NULL,
    additional_requirements text,
    educational_aims        text             NOT NULL,
    learning_outcomes       text,
    classes                 text,
    classes_info            text,
    assessment              text,
    assessment_info         text,
    conveners               text             NOT NULL,
    row_id                  text,

    crawl_url               text             NOT NULL,
    crawl_time              int              NOT NULL
);

